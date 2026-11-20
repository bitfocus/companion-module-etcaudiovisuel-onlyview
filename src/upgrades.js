import {
	FixupBooleanOrVariablesValueToExpressions,
	FixupNumericOrVariablesValueToExpressions,
} from '@companion-module/base'

// Option ids of the number fields that had `useVariables: true` in base 1.x.
// The script matches them on every action: never reuse these ids for an
// option that is not a number.
export const NUMERIC_OPTION_IDS = [
	'quickkeyId',
	'timelineId',
	'value',
	'fadeTime',
	'layerId',
	'boardId',
	'baoardId',
	'sequenceId',
	'presetId',
]
// `state` was the checkbox of the state actions. It is retired: the second
// script moves it to `mode`. Never reuse `state` as an option id.
export const BOOLEAN_OPTION_IDS = ['state']

// Values of the `mode` dropdown of the state actions.
export const StateMode = Object.freeze({ On: 'on', Off: 'off', Toggle: 'toggle' })

// The actions whose `state` checkbox became the `mode` dropdown.
export const STATE_ACTION_IDS = [
	'timelineOnOffStateAction',
	'timelineLayerOnOffStateAction',
	'timelineLayerSoloStateAction',
	'boardOnOffStateAction',
	'boardLayerOnOffStateAction',
	'boardLayerSoloStateAction',
]

function sameValue(a, b) {
	return a?.isExpression === b?.isExpression && a?.value === b?.value
}

// Base 2.x replaces `useVariables` with expressions. Convert saved values, so
// that options which contain `$(var)` strings keep working.
function upgradeToExpressions(_context, props) {
	const updatedActions = []

	for (const action of props.actions) {
		let changed = false
		const fixups = [
			[NUMERIC_OPTION_IDS, FixupNumericOrVariablesValueToExpressions],
			[BOOLEAN_OPTION_IDS, FixupBooleanOrVariablesValueToExpressions],
		]
		for (const [ids, fixup] of fixups) {
			for (const id of ids) {
				const oldValue = action.options[id]
				if (oldValue === undefined) continue
				const newValue = fixup(oldValue)
				if (!sameValue(oldValue, newValue)) {
					action.options[id] = newValue
					changed = true
				}
			}
		}
		if (changed) updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

// A checkbox value becomes On or Off. The old actions tested it with `? 1 : 0`.
// An expression stays an expression, with the same boolean conversion as the
// base helpers: `bool(x) ? "on" : "off"`.
function stateToMode(state) {
	if (state.isExpression) return { isExpression: true, value: `bool(${state.value}) ? "on" : "off"` }
	return { isExpression: false, value: state.value ? StateMode.On : StateMode.Off }
}

// The `state` checkbox of the state actions becomes the On / Off / Toggle `mode`
// dropdown. It runs after upgradeToExpressions, so `state` is already an
// expression or a boolean.
function upgradeStateToMode(_context, props) {
	const updatedActions = []

	for (const action of props.actions) {
		if (!STATE_ACTION_IDS.includes(action.actionId)) continue
		const state = action.options.state
		if (state === undefined) continue
		if (action.options.mode === undefined) action.options.mode = stateToMode(state)
		delete action.options.state
		updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

// Board grand master saved its Board Id as `baoardId` up to 1.0.2. It is a
// separate script, because 2.0.0 configs already ran the first two.
function renameBaoardId(_context, props) {
	const updatedActions = []

	for (const action of props.actions) {
		if (action.actionId !== 'boardGrandMasterAction' || action.options.baoardId === undefined) continue
		if (action.options.boardId === undefined) action.options.boardId = action.options.baoardId
		delete action.options.baoardId
		updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

// Once a script has been added it cannot be removed.
export const UpgradeScripts = [upgradeToExpressions, upgradeStateToMode, renameBaoardId]
