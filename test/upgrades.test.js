import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UpgradeScripts } from '../main.js'

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
