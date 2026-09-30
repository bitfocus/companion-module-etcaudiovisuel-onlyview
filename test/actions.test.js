import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createModule, runAction } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'
import { NUMERIC_OPTION_IDS, BOOLEAN_OPTION_IDS, STATE_ACTION_IDS, StateMode } from '../upgrades.js'
import { Protocol } from '../state.js'

let producer
let instance
let recorded

before(async () => {
	// Timeline 3 and board 7 are paused, for the play/pause toggles.
	producer = await startFakeProducer({
		snapshot: ['statetimeline*3*1*0*100*0', 'stateboard*7*1*0*100*0*-1*-1*-1'],
	})
	;({ instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }))
	await waitFor(() => instance.protocol === Protocol.Subscribed && instance.state.boards.has(7))
})

after(async () => {
	await instance.destroy()
	await producer.close()
})

const cases = [
	['onlineAction', {}, 'online'],
	['onlineAction', { displayId: 0 }, 'online'],
	['onlineAction', { displayId: 4 }, 'online*4'],
	['offlineAction', {}, 'offline'],
	['offlineAction', { displayId: 4 }, 'offline*4'],
	['overrideTestPatternAction', { displayId: 2, outputId: 1, testPatternId: 6 }, 'setoverridepattern*2*0*6'],
	['overrideTestPatternAction', { displayId: 2, outputId: 3, testPatternId: 0 }, 'setoverridepattern*2*2*0'],
	['timelineLocateAction', { timelineId: 3, timecode: '00:01:30:12' }, 'locate*3*tc=00:01:30:12'],
	['timelineLocateAction', { timelineId: 3, timecode: ' 01:02:03 ' }, 'locate*3*tc=01:02:03'],
	['timelineLocateAndPlayAction', { timelineId: 4, timecode: '10:00:00:00' }, 'play*4*tc=10:00:00:00'],
	['timelineLocateAndPlayAction', { timelineId: 4, timecode: '00:00:05' }, 'play*4*tc=00:00:05'],
	['audioOutputVolumeAction', { displayId: 1, outputId: 2, volume: -12.5 }, 'updatescreenoutputaudiovolume*1*1*-12.5'],
	['audioOutputVolumeAction', { displayId: 1, outputId: 1, volume: -100 }, 'updatescreenoutputaudiovolume*1*0*-80'],
	['audioOutputVolumeAction', { displayId: 1, outputId: 1, volume: 10 }, 'updatescreenoutputaudiovolume*1*0*6'],
	[
		'audioOutputVolumeAction',
		{ displayId: 1, outputId: 1, volume: 0.1 + 0.2 },
		'updatescreenoutputaudiovolume*1*0*0.3',
	],
	[
		'audioChannelStateAction',
		{ displayId: 3, outputId: 2, channel: 1, volume: -6, mute: true, signalTest: false },
		'updateaudiochannelstate*3*1*0*-6*1*0',
	],
	[
		'audioChannelStateAction',
		{ displayId: 3, outputId: 1, channel: 8, volume: -3.456, mute: false, signalTest: true },
		'updateaudiochannelstate*3*0*7*-3.46*0*1',
	],
	[
		'audioChannelStateAction',
		{ displayId: 3, outputId: 1, channel: 2, volume: 7 },
		'updateaudiochannelstate*3*0*1*6*0*0',
	],
	['actionGraphEventAction', { graphId: 2, nodeId: 0 }, 'actionGraphNodeEvent*actionEvent*2*0'],
	['actionGraphEventAction', { graphId: 1, nodeId: 17 }, 'actionGraphNodeEvent*actionEvent*1*17'],
	['quickkeyAction', { quickkeyId: 12 }, 'launchquickkey*12'],
	['testPatternAction', { testPatternId: 6 }, 'setpattern*6'],
	['shutdownMasterAction', {}, 'shutdownmaster'],
	['timelinePlayAction', { timelineId: 3 }, 'play*3'],
	['timelinePauseAction', { timelineId: 3 }, 'locate*3'],
	['timelineOnOffStateAction', { timelineId: 2, mode: 'off' }, 'settimelineon*2*0'],
	['timelineGrandMasterAction', { timelineId: 2, value: 50, fadeTime: 1.5 }, 'setgrandmaster*2*50*1500'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 1, layerId: 4, mode: 'on' }, 'setlayerblind*1*2*4*0'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 0, layerId: 4, mode: 'off' }, 'setlayerblind*1*0*4*1'],
	['timelineLayerSoloStateAction', { timelineId: 1, layerType: 1, layerId: 5, mode: 'on' }, 'setlayersolo*1*2*5*1'],
	['boardPlayAction', { boardId: 7 }, 'setBoardPlayState*7*0*1'],
	['boardPauseAction', { boardId: 7 }, 'setBoardPlayState*7*0*0'],
	['boardEnqueueSequenceAction', { boardId: 1, sequenceId: 3 }, 'enqueueSequenceAndPreset*1*2*-1'],
	['boardEnqueueSequenceAndPresetAction', { boardId: 1, sequenceId: 3, presetId: 2 }, 'enqueueSequenceAndPreset*1*2*1'],
	['boardPlaySequenceAction', { boardId: 1, sequenceId: 3 }, 'playBoard*1*2*1*0*-1*0'],
	[
		'boardPlaySequenceAction',
		{ boardId: 1, sequenceId: 3, overridePreset: true, presetId: 2 },
		'playBoard*1*2*1*0*1*0',
	],
	[
		'boardPlaySequenceAction',
		{ boardId: 1, sequenceId: 3, overridePreset: false, presetId: 2 },
		'playBoard*1*2*1*0*-1*0',
	],
	['boardPlaySequenceAction', { boardId: 1, sequenceId: 3, clearQueue: true }, 'playBoard*1*2*1*0*-1*1'],
	[
		'boardPlaySequenceAction',
		{ boardId: 1, sequenceId: 3, overridePreset: true, presetId: 1, clearQueue: true },
		'playBoard*1*2*1*0*0*1',
	],
	['boardNextAction', { boardId: 1 }, 'boardPlayNext*1*0'],
	['boardNextSequenceAction', { boardId: 1 }, 'boardPlayNext*1*1'],
	['boardNextEnqueuedAction', { boardId: 1 }, 'boardPlayNext*1*2'],
	['boardPreviousAction', { boardId: 1 }, 'boardPlayPrevious*1'],
	['boardOnOffStateAction', { boardId: 1, mode: 'on' }, 'setBoardOn*1*1'],
	['boardGrandMasterAction', { boardId: 2, value: 80, fadeTime: 2 }, 'setBoardGrandMaster*2*80*2000'],
	['boardGrandMasterAction', { boardId: 2, value: 150, fadeTime: 1.1 }, 'setBoardGrandMaster*2*100*1100'],
	['timelineGrandMasterAction', { timelineId: 2, value: -5, fadeTime: 0.3 }, 'setgrandmaster*2*0*300'],
	['boardEnqueueSequenceAction', { boardId: 1, sequenceId: 999 }, 'enqueueSequenceAndPreset*1*998*-1'],
	['boardPlaySequenceAction', { boardId: 1, sequenceId: 250 }, 'playBoard*1*249*1*0*-1*0'],
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 1, mode: 'on' }, 'setBoardLayerBlind*1*0*0'],
	['boardLayerSoloStateAction', { boardId: 1, layerId: 2, mode: 'on' }, 'setBoardLayerSolo*1*1*1'],
	['timelineOnOffStateAction', { timelineId: 2, mode: 'on' }, 'settimelineon*2*1'],
	['timelineLayerSoloStateAction', { timelineId: 1, layerType: 0, layerId: 5, mode: 'off' }, 'setlayersolo*1*0*5*0'],
	['boardOnOffStateAction', { boardId: 1, mode: 'off' }, 'setBoardOn*1*0'],
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 3, mode: 'off' }, 'setBoardLayerBlind*1*2*1'],
	['boardLayerSoloStateAction', { boardId: 1, layerId: 2, mode: 'off' }, 'setBoardLayerSolo*1*1*0'],
	['displayOnlineStateAction', { displayId: 4, mode: 'on' }, 'online*4'],
	['displayOnlineStateAction', { displayId: 4, mode: 'off' }, 'offline*4'],
	['timelinePlayPauseAction', { timelineId: 3 }, 'play*3'],
	['boardPlayPauseAction', { boardId: 7 }, 'setBoardPlayState*7*0*1'],
]

test('every action is covered', () => {
	const tested = new Set(cases.map(([id]) => id))
	assert.deepEqual(Object.keys(recorded.actionDefinitions).sort(), [...tested].sort())
})

test('actions send the expected line to Producer', async () => {
	for (const [actionId, options, expected] of cases) {
		const count = producer.lines.length
		await runAction(recorded, actionId, options)
		await producer.waitForLines(count + 1)
		assert.equal(producer.lines[count], expected, actionId)
	}
})

test('number options no longer set useVariables', () => {
	for (const definition of Object.values(recorded.actionDefinitions)) {
		for (const option of definition.options) {
			if (option.type !== 'number') continue
			assert.equal(option.useVariables, undefined, `${definition.name} / ${option.id}`)
		}
	}
})

const ID_OPTIONS = [
	'quickkeyId',
	'timelineId',
	'boardId',
	'layerId',
	'sequenceId',
	'presetId',
	'outputId',
	'channel',
	'graphId',
	'displayId',
	'nodeId',
]

// Node ids start at 0. Display Id 0 means all the Displays.
function expectedIdMin(actionId, optionId) {
	if (optionId === 'nodeId') return 0
	if (optionId === 'displayId' && ['onlineAction', 'offlineAction'].includes(actionId)) return 0
	return 1
}

test('id options only accept integers', () => {
	for (const [actionId, definition] of Object.entries(recorded.actionDefinitions)) {
		for (const option of definition.options) {
			if (!ID_OPTIONS.includes(option.id)) continue
			assert.equal(option.type, 'number', `${definition.name} / ${option.id}`)
			assert.equal(option.asInteger, true, `${definition.name} / ${option.id}`)
			assert.equal(option.min, expectedIdMin(actionId, option.id), `${definition.name} / ${option.id}`)
		}
	}
})

test('board grand master uses boardId', () => {
	const ids = recorded.actionDefinitions.boardGrandMasterAction.options.map((opt) => opt.id)
	assert.deepEqual(ids, ['boardId', 'value', 'fadeTime'])
	for (const definition of Object.values(recorded.actionDefinitions)) {
		assert.ok(!definition.options.some((opt) => opt.id === 'baoardId'), definition.name)
	}
})

test('sequence ids go up to 999', () => {
	for (const actionId of [
		'boardEnqueueSequenceAction',
		'boardEnqueueSequenceAndPresetAction',
		'boardPlaySequenceAction',
	]) {
		const option = recorded.actionDefinitions[actionId].options.find((opt) => opt.id === 'sequenceId')
		assert.equal(option.max, 999, actionId)
	}
})

test('grand master stays in 0-100', () => {
	for (const actionId of ['timelineGrandMasterAction', 'boardGrandMasterAction']) {
		const option = recorded.actionDefinitions[actionId].options.find((opt) => opt.id === 'value')
		assert.equal(option.min, 0, actionId)
		assert.equal(option.max, 100, actionId)
	}
})

test('grand master value is clamped by Companion', () => {
	for (const actionId of ['timelineGrandMasterAction', 'boardGrandMasterAction']) {
		const option = recorded.actionDefinitions[actionId].options.find((opt) => opt.id === 'value')
		assert.equal(option.clampValues, true, actionId)
	}
})

test('board grand master without a valid boardId sends nothing', async () => {
	const count = producer.lines.length
	for (const boardId of [undefined, 0, 1.5, 'abc']) {
		const warnCount = recorded.logs.filter((log) => log.level === 'warn').length
		await runAction(recorded, 'boardGrandMasterAction', { boardId, value: 50 })
		assert.equal(recorded.logs.filter((log) => log.level === 'warn').length, warnCount + 1, String(boardId))
	}
	// TCP keeps the order: a wrong line would come before this one.
	await runAction(recorded, 'boardPreviousAction', { boardId: 3 })
	await producer.waitForLines(count + 1)
	assert.deepEqual(producer.lines.slice(count), ['boardPlayPrevious*3'])
})

test('locate actions without a valid timecode send nothing', async () => {
	const count = producer.lines.length
	for (const actionId of ['timelineLocateAction', 'timelineLocateAndPlayAction']) {
		for (const timecode of [
			'',
			undefined,
			'1:2:3',
			'00:60:00',
			'00:00:60:00',
			'00:01:30:12:00',
			'00:01:30;12',
			'abc',
		]) {
			const warnCount = recorded.logs.filter((log) => log.level === 'warn').length
			await runAction(recorded, actionId, { timelineId: 1, timecode })
			assert.equal(recorded.logs.filter((log) => log.level === 'warn').length, warnCount + 1, `${actionId} ${timecode}`)
		}
	}
	await runAction(recorded, 'boardPreviousAction', { boardId: 3 })
	await producer.waitForLines(count + 1)
	assert.deepEqual(producer.lines.slice(count), ['boardPlayPrevious*3'])
})

test('timecode regex shown in Companion matches the one of the module', () => {
	const option = recorded.actionDefinitions.timelineLocateAction.options.find((opt) => opt.id === 'timecode')
	const match = /^\/(.*)\/([a-z]*)$/.exec(option.regex)
	const regex = new RegExp(match[1], match[2])
	for (const text of ['00:00:00', '00:01:30:12', '99:59:59:119', '1:02:03']) {
		assert.ok(regex.test(text), text)
	}
	for (const text of ['', '00:00', '00:60:00', '00:00:00:', '00:00:00:1234', 'tc=00:00:00']) {
		assert.ok(!regex.test(text), text)
	}
})

test('online and offline with an invalid Display Id send nothing', async () => {
	const count = producer.lines.length
	for (const actionId of ['onlineAction', 'offlineAction']) {
		for (const displayId of [-1, 1.5, 'abc']) {
			const warnCount = recorded.logs.filter((log) => log.level === 'warn').length
			await runAction(recorded, actionId, { displayId })
			assert.equal(
				recorded.logs.filter((log) => log.level === 'warn').length,
				warnCount + 1,
				`${actionId} ${displayId}`,
			)
		}
	}
	await runAction(recorded, 'boardPreviousAction', { boardId: 3 })
	await producer.waitForLines(count + 1)
	assert.deepEqual(producer.lines.slice(count), ['boardPlayPrevious*3'])
})

test('board play sequence shows the preset only when overridden', () => {
	const options = recorded.actionDefinitions.boardPlaySequenceAction.options
	const override = options.find((opt) => opt.id === 'overridePreset')
	assert.equal(override.type, 'checkbox')
	assert.equal(override.default, false)
	assert.equal(override.disableAutoExpression, true)
	const preset = options.find((opt) => opt.id === 'presetId')
	assert.equal(preset.isVisibleExpression, '$(options:overridePreset)')
	assert.equal(options.find((opt) => opt.id === 'clearQueue').default, false)
})

test('audio volume options stay in -80 to +6 dBFS', () => {
	for (const actionId of ['audioOutputVolumeAction', 'audioChannelStateAction']) {
		const option = recorded.actionDefinitions[actionId].options.find((opt) => opt.id === 'volume')
		assert.equal(option.min, -80, actionId)
		assert.equal(option.max, 6, actionId)
		assert.equal(option.clampValues, true, actionId)
	}
})

test('state actions use the On / Off / Toggle mode', () => {
	for (const actionId of STATE_ACTION_IDS) {
		const option = recorded.actionDefinitions[actionId].options.find((opt) => opt.id === 'mode')
		assert.equal(option.type, 'dropdown', actionId)
		assert.deepEqual(
			option.choices.map((c) => c.id),
			[StateMode.On, StateMode.Off, StateMode.Toggle],
			actionId,
		)
		assert.equal(option.default, StateMode.On, actionId)
	}
})

// The upgrade scripts read these ids as the old checkboxes. A new option with one of them would be broken.
test('no action reuses the retired boolean option ids', () => {
	for (const definition of Object.values(recorded.actionDefinitions)) {
		for (const id of BOOLEAN_OPTION_IDS)
			assert.ok(!definition.options.some((opt) => opt.id === id), `${definition.name} / ${id}`)
	}
})

// upgrades.js converts these ids on every action, as numbers.
test('upgraded number option ids keep their type', () => {
	for (const definition of Object.values(recorded.actionDefinitions)) {
		for (const option of definition.options) {
			if (NUMERIC_OPTION_IDS.includes(option.id))
				assert.equal(option.type, 'number', `${definition.name} / ${option.id}`)
		}
	}
})
