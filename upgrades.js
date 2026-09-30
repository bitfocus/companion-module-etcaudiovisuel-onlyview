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
export const BOOLEAN_OPTION_IDS = ['state']

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

// Once a script has been added it cannot be removed.
export const UpgradeScripts = [upgradeToExpressions]
