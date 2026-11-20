import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UpgradeScripts } from '../src/main.js'

const [upgradeToExpressions] = UpgradeScripts

function run(actions) {
	return upgradeToExpressions({ currentConfig: {} }, { config: null, secrets: null, actions, feedbacks: [] })
}

function action(actionId, options) {
	return { id: 'a', controlId: 'c', actionId, options }
}

test('plain values are left alone', () => {
	const result = run([
		action('timelinePlayAction', { timelineId: { isExpression: false, value: 3 } }),
		action('timelineOnOffStateAction', {
			timelineId: { isExpression: false, value: 1 },
			state: { isExpression: false, value: true },
		}),
	])
	assert.deepEqual(result.updatedActions, [])
})

test('variable strings become expressions', () => {
	const result = run([
		action('timelinePlayAction', { timelineId: { isExpression: false, value: '$(internal:custom_tl)' } }),
		action('quickkeyAction', { quickkeyId: { isExpression: false, value: 'qk$(internal:custom_n)' } }),
		action('boardGrandMasterAction', { baoardId: { isExpression: false, value: '4' } }),
	])
	assert.equal(result.updatedActions.length, 3)
	assert.deepEqual(result.updatedActions[0].options.timelineId, {
		isExpression: true,
		value: '$(internal:custom_tl)',
	})
	assert.deepEqual(result.updatedActions[1].options.quickkeyId, {
		isExpression: true,
		value: 'parseVariables("qk$(internal:custom_n)")',
	})
	assert.deepEqual(result.updatedActions[2].options.baoardId, { isExpression: false, value: 4 })
})

test('dropdown options are not touched', () => {
	const result = run([action('testPatternAction', { testPatternId: { isExpression: false, value: '$(x:y)' } })])
	assert.deepEqual(result.updatedActions, [])
})

const upgradeStateToMode = UpgradeScripts[1]

// Runs all the scripts in order, like Companion does for an old config.
function runAll(actions) {
	const updated = new Set()
	for (const script of UpgradeScripts) {
		const result = script({ currentConfig: {} }, { config: null, secrets: null, actions, feedbacks: [] })
		for (const a of result.updatedActions) updated.add(a)
	}
	return updated
}

function runStateToMode(actions) {
	return upgradeStateToMode({ currentConfig: {} }, { config: null, secrets: null, actions, feedbacks: [] })
}

test('state checkboxes become the on / off mode', () => {
	const actions = [
		action('timelineOnOffStateAction', {
			timelineId: { isExpression: false, value: 1 },
			state: { isExpression: false, value: true },
		}),
		action('timelineLayerOnOffStateAction', { state: { isExpression: false, value: false } }),
		action('timelineLayerSoloStateAction', { state: { isExpression: false, value: 1 } }),
		action('boardOnOffStateAction', { state: { isExpression: false, value: 'false' } }),
		action('boardLayerOnOffStateAction', { state: { isExpression: false, value: 0 } }),
		action('boardLayerSoloStateAction', { state: { isExpression: false, value: true } }),
	]
	const updated = runAll(actions)
	assert.equal(updated.size, 6)
	assert.deepEqual(
		actions.map((a) => a.options.mode),
		['on', 'off', 'on', 'off', 'off', 'on'].map((value) => ({ isExpression: false, value })),
	)
	for (const a of actions) assert.ok(!('state' in a.options), a.actionId)
	assert.deepEqual(actions[0].options.timelineId, { isExpression: false, value: 1 })
})

test('state expressions stay expressions', () => {
	const actions = [
		action('timelineOnOffStateAction', { state: { isExpression: true, value: '$(internal:custom_on)' } }),
		// A 1.x string with variables: the first script wraps it in bool(parseVariables(...)).
		action('boardOnOffStateAction', { state: { isExpression: false, value: 'x$(internal:custom_on)' } }),
	]
	runAll(actions)
	assert.deepEqual(actions[0].options.mode, { isExpression: true, value: 'bool($(internal:custom_on)) ? "on" : "off"' })
	assert.deepEqual(actions[1].options.mode, {
		isExpression: true,
		value: 'bool(bool(parseVariables("x$(internal:custom_on)"))) ? "on" : "off"',
	})
})

test('the mode upgrade is idempotent', () => {
	const actions = [action('timelineOnOffStateAction', { state: { isExpression: false, value: false } })]
	assert.equal(runAll(actions).size, 1)
	const mode = actions[0].options.mode
	assert.deepEqual(runStateToMode(actions).updatedActions, [])
	assert.deepEqual(actions[0].options.mode, mode)
})

test('the mode upgrade keeps an existing mode and other actions', () => {
	const actions = [
		action('boardOnOffStateAction', {
			mode: { isExpression: false, value: 'toggle' },
			state: { isExpression: false, value: false },
		}),
		action('boardPlaySequenceAction', { clearQueue: { isExpression: false, value: true } }),
		action('audioChannelStateAction', { mute: { isExpression: false, value: true } }),
		action('otherAction', { state: { isExpression: false, value: true } }),
		action('timelineOnOffStateAction', { timelineId: { isExpression: false, value: 1 } }),
	]
	const result = runStateToMode(actions)
	assert.deepEqual(result.updatedActions, [actions[0]])
	assert.deepEqual(actions[0].options, { mode: { isExpression: false, value: 'toggle' } })
	assert.deepEqual(actions[3].options.state, { isExpression: false, value: true })
	assert.ok(!('mode' in actions[4].options))
})

const renameBaoardId = UpgradeScripts[2]

test('the 1.0.2 baoardId becomes boardId', () => {
	const actions = [
		action('boardGrandMasterAction', {
			baoardId: { isExpression: false, value: '4' },
			value: { isExpression: false, value: 50 },
			fadeTime: { isExpression: false, value: 2 },
		}),
		action('boardGrandMasterAction', { baoardId: { isExpression: false, value: '$(internal:custom_board)' } }),
	]
	runAll(actions)
	assert.deepEqual(actions[0].options, {
		boardId: { isExpression: false, value: 4 },
		value: { isExpression: false, value: 50 },
		fadeTime: { isExpression: false, value: 2 },
	})
	assert.deepEqual(actions[1].options, { boardId: { isExpression: true, value: '$(internal:custom_board)' } })
})

test('the baoardId rename keeps an existing boardId and other actions', () => {
	const actions = [
		action('boardGrandMasterAction', {
			boardId: { isExpression: false, value: 2 },
			baoardId: { isExpression: false, value: 4 },
		}),
		action('boardGrandMasterAction', { boardId: { isExpression: false, value: 3 } }),
		action('otherAction', { baoardId: { isExpression: false, value: 4 } }),
	]
	const result = renameBaoardId({ currentConfig: {} }, { config: null, secrets: null, actions, feedbacks: [] })
	assert.deepEqual(result.updatedActions, [actions[0]])
	assert.deepEqual(actions[0].options, { boardId: { isExpression: false, value: 2 } })
	assert.deepEqual(actions[2].options.baoardId, { isExpression: false, value: 4 })
})
