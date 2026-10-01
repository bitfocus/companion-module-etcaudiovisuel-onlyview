// Ready-made buttons. They are built from the ids of the open show, and
// fall back to id 1 when Producer did not send any object of a kind.
import { BLACK, BLUE, FeedbackId, GREEN, ORANGE, RED, WHITE, YELLOW } from './feedbacks.js'
import { ScreenStatus } from './state.js'
import { StateMode } from './upgrades.js'

// Quick keys have no state: give a fixed number of buttons.
export const QUICKKEY_PRESET_COUNT = 12
// Sequence buttons of the fallback board, when its sequences are unknown.
const FALLBACK_SEQUENCE_COUNT = 4

const sortedIds = (map) => [...map.keys()].sort((a, b) => a - b)

/**
 * The ids and names the presets need, as plain data. Kept on disconnect, so
 * the presets do not disappear with the connection.
 */
export function presetModel(state) {
	return {
		timelines: sortedIds(state.timelines).map((id) => ({ id, name: state.timelines.get(id).name })),
		boards: sortedIds(state.boards).map((id) => {
			const board = state.boards.get(id)
			return {
				id,
				name: board.name,
				sequences: sortedIds(board.sequenceNames).map((column) => ({
					number: column + 1,
					name: board.sequenceNames.get(column),
				})),
			}
		}),
		screens: sortedIds(state.screens).map((id) => ({ id, name: state.screens.get(id).name })),
	}
}

function groupName(kind, object) {
	return object.name ? `${kind} ${object.id} (${object.name})` : `${kind} ${object.id}`
}

const baseStyle = (text) => ({ text, size: 'auto', color: WHITE, bgcolor: BLACK })
const fbStyle = (bgcolor, color = BLACK) => ({ bgcolor, color })
const press = (actionId, options) => [{ down: [{ actionId, options }], up: [] }]
const noPress = () => [{ down: [], up: [] }]
// The action runs once the button is held for `ms`. A short press does nothing.
const hold = (ms, actionId, options) => [
	{ down: [], up: [], [ms]: { options: { runWhileHeld: true }, actions: [{ actionId, options }] } },
]

// Button text is parsed for variables: a show name must not become one.
export const escapeVariables = (text) => text.replaceAll('$(', '$ (')

function preset(name, text, steps, feedbacks = []) {
	return { type: 'simple', name, style: baseStyle(text), steps, feedbacks }
}

// The color shows the state, the symbol shows what a press does.
function playPausePreset(name, title, actionId, playingId, pausedId, options) {
	return preset(name, `${title}\n⏯`, press(actionId, options), [
		{ feedbackId: playingId, options, style: { ...fbStyle(GREEN), text: `${title}\n⏸` } },
		{ feedbackId: pausedId, options, style: { ...fbStyle(YELLOW), text: `${title}\n▶` } },
	])
}

/** Returns { structure, presets } for setPresetDefinitions. `label` is the connection label. */
export function presetDefinitions(model, label) {
	const v = (variable) => `$(${label}:${variable})`
	const presets = {}
	const add = (id, definition) => {
		presets[id] = definition
		return id
	}

	const timelines = model.timelines.length > 0 ? model.timelines : [{ id: 1, name: '' }]
	const timelineGroups = timelines.map(({ id, name }) => {
		const tl = `tl_${id}`
		const options = { timelineId: id }
		return {
			id: `timeline_${id}`,
			type: 'simple',
			name: groupName('Timeline', { id, name }),
			presets: [
				add(
					`${tl}_playpause`,
					playPausePreset(
						`Timeline ${id} play/pause`,
						v(`${tl}_name`),
						'timelinePlayPauseAction',
						FeedbackId.TimelinePlaying,
						FeedbackId.TimelinePaused,
						options,
					),
				),
				add(
					`${tl}_tc`,
					preset(`Timeline ${id} timecode`, `${v(`${tl}_name`)}\n${v(`${tl}_tc`)}`, noPress(), [
						{ feedbackId: FeedbackId.TimelinePlaying, options, style: { color: GREEN } },
					]),
				),
				add(
					`${tl}_onoff`,
					preset(
						`Timeline ${id} ON/OFF`,
						`${v(`${tl}_name`)}\n${v(`${tl}_on`)}`,
						press('timelineOnOffStateAction', { ...options, mode: StateMode.Toggle }),
						[{ feedbackId: FeedbackId.TimelineOn, options, style: fbStyle(BLUE, WHITE) }],
					),
				),
			],
		}
	})

	const boards =
		model.boards.length > 0
			? model.boards
			: [
					{
						id: 1,
						name: '',
						sequences: Array.from({ length: FALLBACK_SEQUENCE_COUNT }, (_, i) => ({ number: i + 1, name: '' })),
					},
				]
	const boardGroups = boards.map(({ id, name, sequences }) => {
		const board = `board_${id}`
		const options = { boardId: id }
		const ids = [
			add(
				`${board}_playpause`,
				playPausePreset(
					`Board ${id} play/pause`,
					v(`${board}_name`),
					'boardPlayPauseAction',
					FeedbackId.BoardPlaying,
					FeedbackId.BoardPaused,
					options,
				),
			),
			add(
				`${board}_previous`,
				preset(
					`Board ${id} previous sequence`,
					`${v(`${board}_name`)}\nPrevious`,
					press('boardPreviousAction', options),
				),
			),
			add(
				`${board}_next`,
				preset(`Board ${id} next sequence`, `${v(`${board}_name`)}\nNext`, press('boardNextAction', options)),
			),
			add(
				`${board}_remaining`,
				preset(`Board ${id} remaining time`, `${v(`${board}_seq_name`)}\n${v(`${board}_remaining`)}`, noPress(), [
					{ feedbackId: FeedbackId.BoardPlaying, options, style: { color: GREEN } },
				]),
			),
			add(
				`${board}_onoff`,
				preset(
					`Board ${id} ON/OFF`,
					`${v(`${board}_name`)}\n${v(`${board}_on`)}`,
					press('boardOnOffStateAction', { ...options, mode: StateMode.Toggle }),
					[{ feedbackId: FeedbackId.BoardOn, options, style: fbStyle(BLUE, WHITE) }],
				),
			),
		]
		for (const sequence of sequences) {
			const sequenceOptions = { ...options, sequenceId: sequence.number }
			ids.push(
				add(
					`${board}_seq_${sequence.number}`,
					preset(
						`Board ${id} play sequence ${sequence.number}`,
						sequence.name ? `${sequence.number}\n${escapeVariables(sequence.name)}` : `Seq ${sequence.number}`,
						press('boardPlaySequenceAction', {
							...sequenceOptions,
							overridePreset: false,
							presetId: 1,
							clearQueue: false,
						}),
						[
							{ feedbackId: FeedbackId.BoardCurrentSequence, options: sequenceOptions, style: fbStyle(GREEN) },
							{ feedbackId: FeedbackId.BoardEnqueuedSequence, options: sequenceOptions, style: fbStyle(ORANGE) },
						],
					),
				),
			)
		}
		return { id: `board_${id}`, type: 'simple', name: groupName('Board', { id, name }), presets: ids }
	})

	const screens = model.screens.length > 0 ? model.screens : [{ id: 1, name: '' }]
	const displayStatusIds = screens.map(({ id }) => {
		const options = { displayId: id }
		const status = (value, bgcolor, color) => ({
			feedbackId: FeedbackId.DisplayStatus,
			options: { ...options, status: value },
			style: fbStyle(bgcolor, color),
		})
		return add(
			`display_${id}_status`,
			preset(`Display ${id} status`, `${v(`display_${id}_name`)}\n${v(`display_${id}_status`)}`, noPress(), [
				status(ScreenStatus.Connected, GREEN),
				status(ScreenStatus.Offline, RED, WHITE),
				status(ScreenStatus.Error, ORANGE),
			]),
		)
	})
	const displayAllIds = [
		add('displays_online', preset('All Displays online', 'Displays\nOnline', press('onlineAction', { displayId: 0 }))),
		add(
			'displays_offline',
			preset('All Displays offline (hold 1 s)', 'Hold:\nAll offline', hold(1000, 'offlineAction', { displayId: 0 })),
		),
	]

	const quickkeyIds = Array.from({ length: QUICKKEY_PRESET_COUNT }, (_, i) =>
		add(
			`quickkey_${i + 1}`,
			preset(`Quick key ${i + 1}`, `Quick key\n${i + 1}`, press('quickkeyAction', { quickkeyId: i + 1 })),
		),
	)

	const showIds = [
		add('producer_connection', {
			...preset('Producer connection', 'Producer\nOffline', noPress(), [
				{
					feedbackId: FeedbackId.ProducerConnected,
					options: {},
					style: { ...fbStyle(GREEN), text: 'Producer\nConnected' },
				},
			]),
			style: { ...baseStyle('Producer\nOffline'), bgcolor: RED },
		}),
		add('show_fps', preset('Show framerate', `FPS\n${v('show_fps')}`, noPress())),
	]

	const structure = [
		{ id: 'timelines', name: 'Timelines', definitions: timelineGroups },
		{ id: 'boards', name: 'Boards', definitions: boardGroups },
		{
			id: 'displays',
			name: 'Displays',
			definitions: [
				{ id: 'displays_status', type: 'simple', name: 'Display status', presets: displayStatusIds },
				{ id: 'displays_all', type: 'simple', name: 'All Displays', presets: displayAllIds },
			],
		},
		{
			id: 'quickkeys',
			name: 'Quick keys',
			description: 'Change the Quick key Id in the action.',
			definitions: quickkeyIds,
		},
		{ id: 'show', name: 'Show / Connection', definitions: showIds },
	]

	return { structure, presets }
}
