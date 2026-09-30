// Variable definitions and values, computed from the subscription state.
// The names are public: users type them in buttons. Do not rename them.
import { ScreenStatus } from './state.js'
import { formatCountdown, formatTimecode, formatTimecodeHms } from './timecode.js'

// A frozen clock must never look live.
const BLANK_TC = '--:--:--:--'
const BLANK_TC_HMS = '--:--:--'

const SCREEN_STATUS_TEXT = {
	[ScreenStatus.Idle]: 'Idle',
	[ScreenStatus.Offline]: 'Offline',
	[ScreenStatus.Connecting]: 'Connecting',
	[ScreenStatus.Connected]: 'Connected',
	[ScreenStatus.Error]: 'Error',
}

function label(kind, id, name) {
	return name ? `${kind} ${id} (${name})` : `${kind} ${id}`
}

const sortedIds = (map) => [...map.keys()].sort((a, b) => a - b)

/** The ids that have variables. Kept on disconnect, so the variables go blank instead of missing. */
export function definedObjects(state) {
	return {
		timelines: sortedIds(state.timelines),
		boards: sortedIds(state.boards),
		screens: sortedIds(state.screens),
	}
}

export function variableDefinitions(state) {
	const defs = { show_fps: { name: 'Show framerate' } }

	for (const id of sortedIds(state.timelines)) {
		const tl = label('Timeline', id, state.timelines.get(id).name)
		defs[`tl_${id}_name`] = { name: `${tl}: name` }
		defs[`tl_${id}_tc`] = { name: `${tl}: timecode (HH:MM:SS:FF)` }
		defs[`tl_${id}_tc_hms`] = { name: `${tl}: timecode (HH:MM:SS)` }
		defs[`tl_${id}_tc_ms`] = { name: `${tl}: timecode (ms)` }
		defs[`tl_${id}_state`] = { name: `${tl}: Play / Pause` }
		defs[`tl_${id}_on`] = { name: `${tl}: ON / OFF` }
		defs[`tl_${id}_gm`] = { name: `${tl}: grand master (0-100)` }
	}

	for (const id of sortedIds(state.boards)) {
		const board = label('Board', id, state.boards.get(id).name)
		defs[`board_${id}_name`] = { name: `${board}: name` }
		defs[`board_${id}_state`] = { name: `${board}: Play / Pause` }
		defs[`board_${id}_on`] = { name: `${board}: ON / OFF` }
		defs[`board_${id}_gm`] = { name: `${board}: grand master (0-100)` }
		defs[`board_${id}_seq`] = { name: `${board}: current sequence` }
		defs[`board_${id}_seq_name`] = { name: `${board}: current sequence name` }
		defs[`board_${id}_next`] = { name: `${board}: enqueued sequence` }
		defs[`board_${id}_next_name`] = { name: `${board}: enqueued sequence name` }
		defs[`board_${id}_tc`] = { name: `${board}: timecode in the sequence (HH:MM:SS:FF)` }
		defs[`board_${id}_tc_hms`] = { name: `${board}: timecode in the sequence (HH:MM:SS)` }
		defs[`board_${id}_tc_ms`] = { name: `${board}: timecode in the sequence (ms)` }
		defs[`board_${id}_remaining`] = { name: `${board}: time to the end of the sequence (HH:MM:SS)` }
		defs[`board_${id}_remaining_ms`] = { name: `${board}: time to the end of the sequence (ms)` }
	}

	for (const id of sortedIds(state.screens)) {
		const display = label('Display', id, state.screens.get(id).name)
		defs[`display_${id}_name`] = { name: `${display}: name` }
		defs[`display_${id}_status`] = { name: `${display}: status` }
	}

	return defs
}

function clockValues(state, clock, prefix, now, values) {
	if (!clock) {
		values[`${prefix}_tc`] = BLANK_TC
		values[`${prefix}_tc_hms`] = BLANK_TC_HMS
		values[`${prefix}_tc_ms`] = ''
		return undefined
	}
	const tc = state.currentTc(clock, now)
	values[`${prefix}_tc`] = formatTimecode(state.fps, tc) ?? BLANK_TC
	values[`${prefix}_tc_hms`] = formatTimecodeHms(state.fps, tc) ?? BLANK_TC_HMS
	values[`${prefix}_tc_ms`] = tc
	return tc
}

const onText = (on) => (on ? 'ON' : 'OFF')
const playText = (playing) => (playing ? 'Play' : 'Pause')

/**
 * Values of all the variables of `objects` (see definedObjects).
 * An object missing from the state gives blank values.
 */
export function variableValues(state, objects, now) {
	const values = { show_fps: state.fps ?? '' }

	for (const id of objects.timelines) {
		const t = state.timelines.get(id)
		const prefix = `tl_${id}`
		clockValues(state, t, prefix, now, values)
		values[`${prefix}_name`] = t ? t.name : ''
		values[`${prefix}_state`] = t ? playText(t.playing) : ''
		values[`${prefix}_on`] = t ? onText(t.on) : ''
		values[`${prefix}_gm`] = t ? t.gm : ''
	}

	for (const id of objects.boards) {
		const b = state.boards.get(id)
		const prefix = `board_${id}`
		const tc = clockValues(state, b, prefix, now, values)
		const hasColumn = b !== undefined && b.column >= 0
		const hasNext = b !== undefined && b.enqueuedColumn >= 0
		const remaining = hasColumn && b.columnDuration >= 0 ? Math.max(0, b.columnDuration - tc) : undefined
		// Producer shows 00:00:00 for an empty sequence (duration 0).
		const emptyColumn = hasColumn && b.columnDuration === 0
		values[`${prefix}_name`] = b ? b.name : ''
		values[`${prefix}_state`] = b ? playText(b.playing) : ''
		values[`${prefix}_on`] = b ? onText(b.on) : ''
		values[`${prefix}_gm`] = b ? b.gm : ''
		values[`${prefix}_seq`] = hasColumn ? b.column + 1 : ''
		values[`${prefix}_seq_name`] = hasColumn ? (b.sequenceNames.get(b.column) ?? '') : ''
		values[`${prefix}_next`] = hasNext ? b.enqueuedColumn + 1 : ''
		values[`${prefix}_next_name`] = hasNext ? (b.sequenceNames.get(b.enqueuedColumn) ?? '') : ''
		values[`${prefix}_remaining`] = emptyColumn ? '00:00:00' : remaining === undefined ? '' : formatCountdown(remaining)
		values[`${prefix}_remaining_ms`] = remaining ?? ''
	}

	for (const id of objects.screens) {
		const s = state.screens.get(id)
		values[`display_${id}_name`] = s ? s.name : ''
		values[`display_${id}_status`] = s ? (SCREEN_STATUS_TEXT[s.status] ?? '') : ''
	}

	return values
}
