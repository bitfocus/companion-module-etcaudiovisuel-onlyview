import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createModule } from './helpers/fake-context.js'
import { waitFor } from './helpers/fake-producer.js'
import { QUICKKEY_PRESET_COUNT } from '../presets.js'
import { OnlyviewState } from '../state.js'
import { variableDefinitions } from '../variables.js'

const SNAPSHOT = [
	'showframerate*25',
	'timelinestate*1*1*0*100*0*Intro',
	'timelinestate*4*1*0*100*1*Show',
	'boardstate*2*1*0*100*1*0*-1*-1*10000*Main',
	'nameboardsequence*2*0*Opening',
	'nameboardsequence*2*1*',
	'nameboardsequence*2*2*Finale $(custom:x)',
	'boardstate*3*0*0*100*0*-1*-1*-1*-1*Empty',
	'screenstate*1*3*Left',
	'screenstate*5*1*Right',
]

// Destroys the instance when the test ends, also on failure: its timers would keep node alive.
async function moduleWith(t, lines) {
	const { instance, recorded } = await createModule({ host: '' })
	t.after(() => instance.destroy())
	if (lines) instance.onData(Buffer.from(['subscribed*1', ...lines].map((l) => l + '\n').join('')))
	// Skip the debounce timer.
	instance.updateDefinitions()
	return { instance, recorded }
}

function optionError(option, value) {
	switch (option.type) {
		case 'number':
			if (typeof value !== 'number') return 'not a number'
			if (option.asInteger && !Number.isInteger(value)) return 'not an integer'
			if (value < option.min || value > option.max) return `out of ${option.min}..${option.max}`
			return undefined
		case 'dropdown':
			return option.choices.some((choice) => choice.id === value) ? undefined : 'not a choice'
		case 'checkbox':
			return typeof value === 'boolean' ? undefined : 'not a boolean'
		case 'textinput': {
			if (typeof value !== 'string') return 'not a string'
			if (!option.regex) return undefined
			const [, body, flags] = option.regex.match(/^\/(.*)\/([a-z]*)$/)
			return new RegExp(body, flags).test(value) ? undefined : 'does not match the regex'
		}
		default:
			return `unchecked option type ${option.type}`
	}
}

// Every option of the definition is set, with a valid value, and nothing else.
function checkOptions(where, definition, options) {
	const ids = definition.options.map((option) => option.id)
	assert.deepEqual(Object.keys(options).sort(), [...ids].sort(), `${where}: option ids`)
	for (const option of definition.options) {
		const error = optionError(option, options[option.id])
		assert.equal(error, undefined, `${where}: option ${option.id} = ${JSON.stringify(options[option.id])}`)
	}
}

// CompanionButtonStyleProps in base 2.0.4.
const STYLE_KEYS = [
	'text',
	'textExpression',
	'size',
	'color',
	'bgcolor',
	'alignment',
	'pngalignment',
	'png64',
	'show_topbar',
]

function checkStyle(where, style) {
	for (const key of Object.keys(style)) assert.ok(STYLE_KEYS.includes(key), `${where}: unknown style key ${key}`)
}

// The down and up actions, and the actions of the long-press groups (keyed by a duration in ms).
function stepActions(where, step) {
	const actions = [...step.down, ...step.up]
	for (const [key, group] of Object.entries(step)) {
		if (key === 'down' || key === 'up' || key === 'name') continue
		assert.match(key, /^[1-9]\d*$/, `${where}: unknown step key ${key}`)
		if (Array.isArray(group)) {
			actions.push(...group)
			continue
		}
		for (const option of Object.keys(group.options ?? {})) assert.equal(option, 'runWhileHeld', where)
		actions.push(...group.actions)
	}
	return actions
}

function checkPresets(recorded) {
	const presets = recorded.presetDefinitions
	for (const [presetId, preset] of Object.entries(presets)) {
		assert.equal(preset.type, 'simple', presetId)
		assert.equal(typeof preset.name, 'string', presetId)
		for (const key of ['text', 'size', 'color', 'bgcolor']) assert.ok(key in preset.style, `${presetId}: no ${key}`)
		checkStyle(presetId, preset.style)
		assert.equal(typeof preset.style.text, 'string', presetId)
		assert.ok(preset.steps.length > 0, presetId)
		for (const step of preset.steps) {
			for (const action of stepActions(presetId, step)) {
				const definition = recorded.actionDefinitions[action.actionId]
				assert.ok(definition, `${presetId}: unknown action ${action.actionId}`)
				checkOptions(`${presetId} ${action.actionId}`, definition, action.options)
			}
		}
		for (const feedback of preset.feedbacks) {
			const definition = recorded.feedbackDefinitions[feedback.feedbackId]
			assert.ok(definition, `${presetId}: unknown feedback ${feedback.feedbackId}`)
			assert.equal(definition.type, 'boolean')
			assert.ok(Object.keys(feedback.style).length > 0, `${presetId}: ${feedback.feedbackId} has no style`)
			checkStyle(`${presetId} ${feedback.feedbackId}`, feedback.style)
			checkOptions(`${presetId} ${feedback.feedbackId}`, definition, feedback.options)
		}
	}
}

// Unique section and group ids. Each preset is in exactly one place.
function checkStructure(recorded) {
	const sectionIds = new Set()
	const groupIds = new Set()
	const referenced = []
	for (const section of recorded.presetStructure) {
		assert.ok(!sectionIds.has(section.id), `duplicate section ${section.id}`)
		sectionIds.add(section.id)
		assert.ok(section.definitions.length > 0, `empty section ${section.id}`)
		for (const definition of section.definitions) {
			if (typeof definition === 'string') {
				referenced.push(definition)
				continue
			}
			assert.equal(definition.type, 'simple')
			assert.ok(!groupIds.has(definition.id), `duplicate group ${definition.id}`)
			groupIds.add(definition.id)
			referenced.push(...definition.presets)
		}
	}
	assert.deepEqual([...referenced].sort(), Object.keys(recorded.presetDefinitions).sort())
	assert.equal(new Set(referenced).size, referenced.length, 'a preset is in two places')
}

const textVariables = (recorded, label) =>
	Object.values(recorded.presetDefinitions).flatMap((preset) =>
		[...preset.style.text.matchAll(/\$\(([^:)]+):([^)]+)\)/g)].map((match) => {
			assert.equal(match[1], label)
			return match[2]
		}),
	)

// Every variable of the texts is a variable that the module defines for these lines.
function checkTextVariables(recorded, lines) {
	const state = new OnlyviewState()
	state.startSubscription()
	for (const line of lines) state.handleLine(line, 0)
	const defined = variableDefinitions(state)
	const variables = textVariables(recorded, 'onlyview')
	assert.ok(variables.length > 0)
	for (const variable of variables) assert.ok(variable in defined, variable)
}

const presetIds = (recorded) => Object.keys(recorded.presetDefinitions).sort()

test('presets: valid actions, feedbacks and structure, with the show ids', async (t) => {
	const { recorded } = await moduleWith(t, SNAPSHOT)
	checkPresets(recorded)
	checkStructure(recorded)

	const ids = presetIds(recorded)
	for (const id of ['tl_1_playpause', 'tl_4_tc', 'tl_4_onoff', 'board_2_seq_3', 'board_3_next', 'display_5_status'])
		assert.ok(ids.includes(id), id)
	assert.ok(!ids.includes('tl_2_playpause'))
	assert.ok(!ids.includes('board_2_seq_4'))
	assert.ok(!ids.some((id) => id.startsWith('board_3_seq_')), 'board 3 has no sequence')
	assert.equal(ids.filter((id) => id.startsWith('quickkey_')).length, QUICKKEY_PRESET_COUNT)

	assert.deepEqual(
		recorded.presetStructure.map((section) => section.id),
		['timelines', 'boards', 'displays', 'quickkeys', 'show'],
	)
	assert.equal(recorded.presetStructure[0].definitions[1].name, 'Timeline 4 (Show)')
	assert.equal(recorded.presetDefinitions.board_2_seq_1.style.text, '1\nOpening')
	assert.equal(recorded.presetDefinitions.board_2_seq_2.style.text, 'Seq 2')
	assert.equal(recorded.presetDefinitions.board_2_seq_3.style.text, '3\nFinale $ (custom:x)')
	assert.equal(recorded.presetDefinitions.tl_4_tc.style.text, '$(onlyview:tl_4_name)\n$(onlyview:tl_4_tc)')

	// Play/pause shows what a press does: pause while playing, play while paused.
	const playPause = recorded.presetDefinitions.tl_1_playpause
	assert.equal(playPause.style.text, '$(onlyview:tl_1_name)\n⏯')
	const textOf = (feedbackId) => playPause.feedbacks.find((f) => f.feedbackId === feedbackId).style.text
	assert.equal(textOf('timelinePlaying'), '$(onlyview:tl_1_name)\n⏸')
	assert.equal(textOf('timelinePaused'), '$(onlyview:tl_1_name)\n▶')

	checkTextVariables(recorded, SNAPSHOT)
})

test('presets: one button per quick key of the show', async (t) => {
	const { instance, recorded } = await moduleWith(t, [...SNAPSHOT, 'quickkeystate*3*Go * 1', 'quickkeystate*20*'])
	checkPresets(recorded)
	assert.deepEqual(
		presetIds(recorded).filter((id) => id.startsWith('quickkey_')),
		['quickkey_20', 'quickkey_3'],
	)
	assert.equal(recorded.presetDefinitions.quickkey_3.style.text, '3\n$(onlyview:quickkey_3_name)')
	assert.equal(recorded.presetDefinitions.quickkey_3.name, 'Quick key 3 (Go * 1)')
	assert.equal(recorded.presetDefinitions.quickkey_20.name, 'Quick key 20')
	assert.equal(recorded.variableValues.quickkey_3_name, 'Go * 1')
	assert.equal(recorded.variableDefinitions.quickkey_3_name.name, 'Quick key 3 (Go * 1): name')

	// Quick key 20 was removed: Producer resends the full state.
	instance.onData(Buffer.from(['subscribed*1', ...SNAPSHOT, 'quickkeystate*3*Stop', ''].join('\n')))
	instance.updateDefinitions()
	assert.equal(recorded.variableValues.quickkey_3_name, 'Stop')
	assert.equal(recorded.presetDefinitions.quickkey_3.name, 'Quick key 3 (Stop)')
	assert.ok(!presetIds(recorded).includes('quickkey_20'))
	assert.ok(!('quickkey_20_name' in recorded.variableDefinitions))
})

test('the sequence lists contain the named sequences of the show', async (t) => {
	const { instance, recorded } = await moduleWith(t, SNAPSHOT)
	const expected = [
		{ id: '2*1', label: 'Board 2 (Main) – Seq 1: Opening' },
		{ id: '2*3', label: 'Board 2 (Main) – Seq 3: Finale $(custom:x)' },
	]
	const lists = [
		recorded.actionDefinitions.boardPlaySequenceFromListAction.options[0],
		recorded.actionDefinitions.boardEnqueueSequenceFromListAction.options[0],
		recorded.feedbackDefinitions.boardCurrentSequenceFromList.options[0],
		recorded.feedbackDefinitions.boardEnqueuedSequenceFromList.options[0],
	]
	for (const list of lists) {
		assert.deepEqual(list.choices, expected)
		assert.equal(list.default, '2*1')
		assert.equal(list.allowCustom, true)
	}

	instance.onData(Buffer.from('nameboardsequence*2*1*Interlude\n'))
	instance.updateDefinitions()
	assert.deepEqual(
		recorded.actionDefinitions.boardPlaySequenceFromListAction.options[0].choices.map((c) => c.id),
		['2*1', '2*2', '2*3'],
	)
})

test('presets: id 1 when Producer sent nothing', async (t) => {
	const { recorded } = await moduleWith(t, undefined)
	checkPresets(recorded)
	checkStructure(recorded)
	const ids = presetIds(recorded)
	for (const id of ['tl_1_playpause', 'board_1_playpause', 'board_1_seq_1', 'board_1_seq_4', 'display_1_status'])
		assert.ok(ids.includes(id), id)
	assert.ok(!ids.includes('board_1_seq_5'))
	checkTextVariables(recorded, [
		'timelinestate*1*1*0*100*0*Intro',
		'boardstate*1*1*0*100*0*-1*-1*-1*-1*',
		'screenstate*1*3*Left',
	])
})

test('presets: kept on disconnect, rebuilt on a new id and a new label', async (t) => {
	const { instance, recorded } = await moduleWith(t, SNAPSHOT)
	const before = presetIds(recorded)
	const calls = recorded.presetCalls

	instance.onDisconnected()
	instance.updateDefinitions()
	assert.deepEqual(presetIds(recorded), before)
	assert.equal(recorded.presetCalls, calls, 'no rebuild when nothing changed')

	instance.onData(
		Buffer.from(['subscribed*1', ...SNAPSHOT, 'timelinestate*7*1*0*100*0*New'].map((l) => l + '\n').join('')),
	)
	instance.updateDefinitions()
	assert.ok(presetIds(recorded).includes('tl_7_playpause'))

	// Companion changes the label just before configUpdated.
	instance.updateDefinitions()
	const callsBeforeRename = recorded.presetCalls
	Object.defineProperty(instance, 'label', { value: 'ov2' })
	await instance.configUpdated({ host: '' })
	assert.ok(recorded.presetCalls > callsBeforeRename)
	assert.equal(recorded.presetDefinitions.tl_1_tc.style.text, '$(ov2:tl_1_name)\n$(ov2:tl_1_tc)')
})

test('presets: built once the structure changes stop', async (t) => {
	const { instance, recorded } = await createModule({ host: '' }, (i) =>
		Object.assign(i.timing, { definitionsMs: 60, definitionsMaxMs: 10000 }),
	)
	t.after(() => instance.destroy())
	const feed = (...lines) => instance.onData(Buffer.from(lines.map((l) => l + '\n').join('')))
	const calls = recorded.presetCalls

	// A snapshot in several packets, closer together than definitionsMs.
	feed('subscribed*1', 'timelinestate*1*1*0*100*0*Intro')
	for (const id of [2, 3, 4]) {
		await new Promise((resolve) => setTimeout(resolve, 20))
		feed(`timelinestate*${id}*1*0*100*0*`)
	}
	await waitFor(() => !instance.definitionsTimer)
	assert.equal(recorded.presetCalls, calls + 1, 'one build, from the full show')
	assert.ok(presetIds(recorded).includes('tl_4_playpause'))
})

test('presets: a constant stream of changes waits at most definitionsMaxMs', async (t) => {
	const { instance, recorded } = await createModule({ host: '' }, (i) =>
		Object.assign(i.timing, { definitionsMs: 50, definitionsMaxMs: 150 }),
	)
	t.after(() => instance.destroy())
	const feed = (...lines) => instance.onData(Buffer.from(lines.map((l) => l + '\n').join('')))
	feed('subscribed*1')

	const start = performance.now()
	let id = 50
	while (!presetIds(recorded).includes('tl_50_playpause')) {
		assert.ok(performance.now() - start < 1000, 'the presets were never built')
		feed(`timelinestate*${id++}*1*0*100*0*`)
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
})
