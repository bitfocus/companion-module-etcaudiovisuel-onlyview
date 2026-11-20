import { combineRgb } from '@companion-module/base'
import { ChangeKind, ScreenStatus, ScreenStatusText } from './state.js'

export const BLACK = combineRgb(0, 0, 0)
export const WHITE = combineRgb(255, 255, 255)
export const GREEN = combineRgb(0, 204, 0)
export const YELLOW = combineRgb(255, 204, 0)
export const ORANGE = combineRgb(255, 128, 0)
export const RED = combineRgb(204, 0, 0)
export const BLUE = combineRgb(0, 102, 204)

export const FeedbackId = Object.freeze({
	ProducerConnected: 'producerConnected',
	TimelinePlaying: 'timelinePlaying',
	TimelinePaused: 'timelinePaused',
	TimelineOn: 'timelineOn',
	TimelineLayerBlind: 'timelineLayerBlind',
	TimelineLayerSolo: 'timelineLayerSolo',
	BoardPlaying: 'boardPlaying',
	BoardPaused: 'boardPaused',
	BoardOn: 'boardOn',
	BoardCurrentSequence: 'boardCurrentSequence',
	BoardEnqueuedSequence: 'boardEnqueuedSequence',
	BoardCurrentSequenceFromList: 'boardCurrentSequenceFromList',
	BoardEnqueuedSequenceFromList: 'boardEnqueuedSequenceFromList',
	BoardLayerBlind: 'boardLayerBlind',
	BoardLayerSolo: 'boardLayerSolo',
	DisplayStatus: 'displayStatus',
})

// The feedbacks to check again for each kind of state change.
// The state is cleared on every subscription change, which reports all the kinds.
export const FEEDBACKS_BY_CHANGE = Object.freeze({
	[ChangeKind.Connection]: [FeedbackId.ProducerConnected],
	[ChangeKind.Fps]: [],
	[ChangeKind.Timeline]: [FeedbackId.TimelinePlaying, FeedbackId.TimelinePaused, FeedbackId.TimelineOn],
	[ChangeKind.TimelineLayer]: [FeedbackId.TimelineLayerBlind, FeedbackId.TimelineLayerSolo],
	[ChangeKind.Board]: [
		FeedbackId.BoardPlaying,
		FeedbackId.BoardPaused,
		FeedbackId.BoardOn,
		FeedbackId.BoardCurrentSequence,
		FeedbackId.BoardEnqueuedSequence,
		FeedbackId.BoardCurrentSequenceFromList,
		FeedbackId.BoardEnqueuedSequenceFromList,
	],
	[ChangeKind.BoardLayer]: [FeedbackId.BoardLayerBlind, FeedbackId.BoardLayerSolo],
	[ChangeKind.BoardSequence]: [],
	[ChangeKind.Screen]: [FeedbackId.DisplayStatus],
	[ChangeKind.Structure]: [],
})

/** The feedback ids to check for a Set of ChangeKind. */
export function feedbacksForChanges(changes) {
	const ids = new Set()
	for (const kind of changes) for (const id of FEEDBACKS_BY_CHANGE[kind] ?? []) ids.add(id)
	return [...ids]
}

// Layer type option of the actions: 0 command layer, 1 media layer. Producer uses part 0 and 2.
export function timelineLayerPart(layerType) {
	return Number(layerType) === 1 ? 2 : 0
}

// Only objects whose state line arrived: a placeholder has no real state yet.
function findKnown(state, map, id) {
	if (!state.subscribed) return undefined
	const object = map.get(Number(id))
	return object?.known ? object : undefined
}

// The objects the feedbacks and the toggles read. Undefined when unknown or not subscribed.
export function findTimeline(state, timelineId) {
	return findKnown(state, state.timelines, timelineId)
}

export function findTimelineLayer(state, timelineId, layerType, layerId) {
	return findTimeline(state, timelineId)?.layers.get(`${timelineLayerPart(layerType)}*${Number(layerId)}`)
}

export function findBoard(state, boardId) {
	return findKnown(state, state.boards, boardId)
}

// Board layers are 1-based in the options, 0-based in Producer.
export function findBoardLayer(state, boardId, layerId) {
	return findBoard(state, boardId)?.layers.get(Number(layerId) - 1)
}

export function findScreen(state, displayId) {
	return findKnown(state, state.screens, displayId)
}

/**
 * The sequence lists: one choice per named sequence, with the id "<board id>*<sequence number>".
 * `boards` comes from presetModel, so the list is kept on disconnect, like the presets.
 */
export function sequenceListOption(boards) {
	const choices = []
	for (const board of boards) {
		const boardLabel = board.name ? `Board ${board.id} (${board.name})` : `Board ${board.id}`
		for (const { number, name } of board.sequences)
			if (name) choices.push({ id: `${board.id}*${number}`, label: `${boardLabel} – Seq ${number}: ${name}` })
	}
	return {
		type: 'dropdown',
		id: 'sequence',
		label: 'Sequence',
		description: 'The named sequences of the show. Or type <board id>*<sequence number>, for example 1*3.',
		choices,
		default: choices[0]?.id ?? '1*1',
		allowCustom: true,
		regex: '/^\\d+\\*\\d+$/',
	}
}

/** "<board id>*<sequence number>" -> { boardId, sequenceId }, or undefined. Custom values are strings. */
export function parseSequence(value) {
	const match = /^(\d+)\*(\d+)$/.exec(String(value ?? '').trim())
	if (!match || Number(match[2]) < 1) return undefined
	return { boardId: Number(match[1]), sequenceId: Number(match[2]) }
}

// `key` is the 0-based column of the board state: column or enqueuedColumn.
function isSequence(state, value, key) {
	const target = parseSequence(value)
	return target !== undefined && findBoard(state, target.boardId)?.[key] === target.sequenceId - 1
}

function idOption(id, label, max) {
	return { type: 'number', id, label, default: 1, min: 1, max, asInteger: true }
}

const timelineOption = () => idOption('timelineId', 'Timeline Id', 99)
const boardOption = () => idOption('boardId', 'Board Id', 99)
const layerTypeOption = () => ({
	type: 'dropdown',
	id: 'layerType',
	label: 'Layer type',
	choices: [
		{ id: 0, label: 'Command layer' },
		{ id: 1, label: 'Media layer' },
	],
	default: 1,
})

const style = (bgcolor, color = BLACK) => ({ bgcolor, color })

export default function UpdateFeedbacks(self) {
	const state = self.state
	const boards = self.presetObjects?.boards ?? []

	self.setFeedbackDefinitions({
		[FeedbackId.ProducerConnected]: {
			type: 'boolean',
			name: 'Producer connection is alive',
			description: 'Connected, and Producer replies. Also true with a Producer too old for feedbacks.',
			defaultStyle: style(GREEN),
			options: [],
			callback: () => self.isProducerAlive(),
		},

		[FeedbackId.TimelinePlaying]: {
			type: 'boolean',
			name: 'Timeline is playing',
			defaultStyle: style(GREEN),
			options: [timelineOption()],
			callback: (fb) => findTimeline(state, fb.options.timelineId)?.playing === true,
		},

		[FeedbackId.TimelinePaused]: {
			type: 'boolean',
			name: 'Timeline is paused',
			defaultStyle: style(YELLOW),
			options: [timelineOption()],
			callback: (fb) => findTimeline(state, fb.options.timelineId)?.playing === false,
		},

		[FeedbackId.TimelineOn]: {
			type: 'boolean',
			name: 'Timeline is ON',
			defaultStyle: style(BLUE, WHITE),
			options: [timelineOption()],
			callback: (fb) => findTimeline(state, fb.options.timelineId)?.on === true,
		},

		[FeedbackId.TimelineLayerBlind]: {
			type: 'boolean',
			name: 'Timeline layer is OFF (blind)',
			defaultStyle: style(RED, WHITE),
			options: [timelineOption(), layerTypeOption(), idOption('layerId', 'Layer Id', 199)],
			callback: (fb) =>
				findTimelineLayer(state, fb.options.timelineId, fb.options.layerType, fb.options.layerId)?.blind === true,
		},

		[FeedbackId.TimelineLayerSolo]: {
			type: 'boolean',
			name: 'Timeline layer is solo',
			defaultStyle: style(YELLOW),
			options: [timelineOption(), layerTypeOption(), idOption('layerId', 'Layer Id', 199)],
			callback: (fb) =>
				findTimelineLayer(state, fb.options.timelineId, fb.options.layerType, fb.options.layerId)?.solo === true,
		},

		[FeedbackId.BoardPlaying]: {
			type: 'boolean',
			name: 'Board is playing',
			defaultStyle: style(GREEN),
			options: [boardOption()],
			callback: (fb) => findBoard(state, fb.options.boardId)?.playing === true,
		},

		[FeedbackId.BoardPaused]: {
			type: 'boolean',
			name: 'Board is paused',
			defaultStyle: style(YELLOW),
			options: [boardOption()],
			callback: (fb) => findBoard(state, fb.options.boardId)?.playing === false,
		},

		[FeedbackId.BoardOn]: {
			type: 'boolean',
			name: 'Board is ON',
			defaultStyle: style(BLUE, WHITE),
			options: [boardOption()],
			callback: (fb) => findBoard(state, fb.options.boardId)?.on === true,
		},

		[FeedbackId.BoardCurrentSequence]: {
			type: 'boolean',
			name: 'Board current sequence is',
			defaultStyle: style(GREEN),
			options: [boardOption(), idOption('sequenceId', 'Sequence Id', 999)],
			callback: (fb) => {
				const column = findBoard(state, fb.options.boardId)?.column
				return column !== undefined && column >= 0 && column === Number(fb.options.sequenceId) - 1
			},
		},

		[FeedbackId.BoardEnqueuedSequence]: {
			type: 'boolean',
			name: 'Board enqueued sequence is',
			defaultStyle: style(ORANGE),
			options: [boardOption(), idOption('sequenceId', 'Sequence Id', 999)],
			callback: (fb) => {
				const column = findBoard(state, fb.options.boardId)?.enqueuedColumn
				return column !== undefined && column >= 0 && column === Number(fb.options.sequenceId) - 1
			},
		},

		[FeedbackId.BoardCurrentSequenceFromList]: {
			type: 'boolean',
			name: 'Board current sequence is (from list)',
			defaultStyle: style(GREEN),
			options: [sequenceListOption(boards)],
			callback: (fb) => isSequence(state, fb.options.sequence, 'column'),
		},

		[FeedbackId.BoardEnqueuedSequenceFromList]: {
			type: 'boolean',
			name: 'Board enqueued sequence is (from list)',
			defaultStyle: style(ORANGE),
			options: [sequenceListOption(boards)],
			callback: (fb) => isSequence(state, fb.options.sequence, 'enqueuedColumn'),
		},

		[FeedbackId.BoardLayerBlind]: {
			type: 'boolean',
			name: 'Board layer is OFF (blind)',
			defaultStyle: style(RED, WHITE),
			options: [boardOption(), idOption('layerId', 'Layer Id', 199)],
			callback: (fb) => findBoardLayer(state, fb.options.boardId, fb.options.layerId)?.blind === true,
		},

		[FeedbackId.BoardLayerSolo]: {
			type: 'boolean',
			name: 'Board layer is solo',
			defaultStyle: style(YELLOW),
			options: [boardOption(), idOption('layerId', 'Layer Id', 199)],
			callback: (fb) => findBoardLayer(state, fb.options.boardId, fb.options.layerId)?.solo === true,
		},

		[FeedbackId.DisplayStatus]: {
			type: 'boolean',
			name: 'Display status is',
			defaultStyle: style(GREEN),
			options: [
				idOption('displayId', 'Display Id', 999),
				{
					type: 'dropdown',
					id: 'status',
					label: 'Status',
					// The ids are the text of `display_<id>_status`, for the expression mode.
					choices: [
						ScreenStatus.Connected,
						ScreenStatus.Offline,
						ScreenStatus.Error,
						ScreenStatus.Connecting,
						ScreenStatus.Idle,
					].map((status) => ({ id: ScreenStatusText[status], label: ScreenStatusText[status] })),
					default: ScreenStatusText[ScreenStatus.Connected],
					expressionDescription: 'Connected, Offline, Error, Connecting or Idle',
				},
			],
			callback: (fb) => {
				const text = ScreenStatusText[findScreen(state, fb.options.displayId)?.status]
				return text !== undefined && text.toLowerCase() === String(fb.options.status).trim().toLowerCase()
			},
		},
	})
}
