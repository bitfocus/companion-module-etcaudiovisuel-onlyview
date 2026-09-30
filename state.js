// The show state pushed by Producer after `subscribe`. See the protocol in HELP.md.
// The parser fills plain Maps. Each change adds a kind to `changes`, and the
// instance reads them in one batch after each network packet.

export const ChangeKind = Object.freeze({
	// The subscription started or stopped
	Connection: 'connection',
	Fps: 'fps',
	Timeline: 'timeline',
	TimelineLayer: 'timelineLayer',
	Board: 'board',
	BoardLayer: 'boardLayer',
	BoardSequence: 'boardSequence',
	Screen: 'screen',
	// Objects were added or removed, or renamed: the variable definitions change
	Structure: 'structure',
})

// How Producer answered `subscribe`.
export const Protocol = Object.freeze({
	None: 'none', // not connected
	Pending: 'pending', // waiting for `subscribed`
	Subscribed: 'subscribed',
	Legacy: 'legacy', // no reply: old Producer, or Accept remote commands is off
})

export const PlayState = Object.freeze({ Pause: 0, Play: 1 })

// _StatusScreen in Onlyview
export const ScreenStatus = Object.freeze({ Idle: 0, Offline: 1, Connecting: 2, Connected: 3, Error: 4 })

function toInt(text) {
	return /^-?\d+$/.test(text ?? '') ? Number(text) : undefined
}

function toNumber(text) {
	if (text === undefined || text === '') return undefined
	const value = Number(text)
	return Number.isFinite(value) ? value : undefined
}

// Joins the last fields back: names may contain `*`.
function nameField(fields, index) {
	return fields.length > index ? fields.slice(index).join('*') : undefined
}

export class OnlyviewState {
	constructor() {
		this.changes = new Set()
		this.reset()
	}

	reset() {
		// True between `subscribed` and the disconnection
		this.subscribed = false
		this.fps = undefined
		this.timelines = new Map()
		this.boards = new Map()
		this.screens = new Map()
	}

	// Drops everything. Every kind is reported, so dependent values go blank.
	clear() {
		for (const kind of Object.values(ChangeKind)) this.changes.add(kind)
		this.reset()
	}

	// Called on `subscribed`: Producer resends a full snapshot after it.
	startSubscription() {
		this.clear()
		this.subscribed = true
	}

	takeChanges() {
		const changes = this.changes
		this.changes = new Set()
		return changes
	}

	/** The interpolated timecode of a timeline or a board, in integer ms. */
	currentTc(clock, now) {
		const tc = clock.playing ? clock.tc + Math.max(0, now - clock.receivedAt) : clock.tc
		return Math.floor(tc)
	}

	isAnyPlaying() {
		for (const t of this.timelines.values()) if (t.playing) return true
		for (const b of this.boards.values()) if (b.playing) return true
		return false
	}

	/** Returns false if the line is not a state line. */
	handleLine(line, now) {
		const fields = line.split('*')
		const handler = HANDLERS[fields[0]]
		if (!handler) return false
		handler(this, fields, now)
		return true
	}

	timeline(id, now) {
		let t = this.timelines.get(id)
		if (!t) {
			// `known` is false until the state line: a name or layer line creates a placeholder.
			t = { id, name: '', known: false, on: false, tc: 0, receivedAt: now, gm: 0, playing: false, layers: new Map() }
			this.timelines.set(id, t)
			this.changes.add(ChangeKind.Structure)
		}
		return t
	}

	board(id, now) {
		let b = this.boards.get(id)
		if (!b) {
			b = {
				id,
				name: '',
				known: false,
				on: false,
				tc: 0,
				receivedAt: now,
				gm: 0,
				playing: false,
				column: -1,
				enqueuedColumn: -1,
				columnDuration: -1,
				sequenceNames: new Map(),
				layers: new Map(),
			}
			this.boards.set(id, b)
			this.changes.add(ChangeKind.Structure)
		}
		return b
	}

	screen(id) {
		let s = this.screens.get(id)
		if (!s) {
			s = { id, name: '', known: false, status: ScreenStatus.Idle }
			this.screens.set(id, s)
			this.changes.add(ChangeKind.Structure)
		}
		return s
	}
}

const HANDLERS = {
	showframerate(state, fields) {
		const fps = toNumber(fields[1])
		if (fps === undefined || fps === state.fps) return
		state.fps = fps
		state.changes.add(ChangeKind.Fps)
	},

	nametimeline(state, fields, now) {
		const id = toInt(fields[1])
		const name = nameField(fields, 2)
		if (id === undefined || name === undefined) return
		state.timeline(id, now).name = name
		state.changes.add(ChangeKind.Timeline).add(ChangeKind.Structure)
	},

	// statetimeline*<id>*<on>*<tc ms>*<gm>*<playState>
	statetimeline(state, fields, now) {
		const id = toInt(fields[1])
		const tc = toNumber(fields[3])
		if (id === undefined || tc === undefined || fields.length < 6) return
		const t = state.timeline(id, now)
		t.known = true
		t.on = fields[2] === '1'
		t.tc = tc
		t.receivedAt = now
		t.gm = toNumber(fields[4]) ?? 0
		t.playing = toInt(fields[5]) === PlayState.Play
		state.changes.add(ChangeKind.Timeline)
	},

	// statetimelinelayer*<tl>*<part>*<layerId>*<blind>*<solo>
	statetimelinelayer(state, fields, now) {
		const id = toInt(fields[1])
		const part = toInt(fields[2])
		const layer = toInt(fields[3])
		if (id === undefined || part === undefined || layer === undefined || fields.length < 6) return
		state
			.timeline(id, now)
			.layers.set(`${part}*${layer}`, { part, layer, blind: fields[4] === '1', solo: fields[5] === '1' })
		state.changes.add(ChangeKind.TimelineLayer)
	},

	nameboard(state, fields, now) {
		const id = toInt(fields[1])
		const name = nameField(fields, 2)
		if (id === undefined || name === undefined) return
		state.board(id, now).name = name
		state.changes.add(ChangeKind.Board).add(ChangeKind.Structure)
	},

	// stateboard*<id>*<on>*<tc ms>*<gm>*<playState>*<column>*<enqueuedColumn>*<columnDuration ms>
	stateboard(state, fields, now) {
		const id = toInt(fields[1])
		const tc = toNumber(fields[3])
		if (id === undefined || tc === undefined || fields.length < 7) return
		const b = state.board(id, now)
		b.known = true
		b.on = fields[2] === '1'
		b.tc = tc
		b.receivedAt = now
		b.gm = toNumber(fields[4]) ?? 0
		b.playing = toInt(fields[5]) === PlayState.Play
		b.column = toInt(fields[6]) ?? -1
		b.enqueuedColumn = toInt(fields[7]) ?? -1
		b.columnDuration = toNumber(fields[8]) ?? -1
		state.changes.add(ChangeKind.Board)
	},

	// nameboardsequence*<board>*<column>*<name>
	nameboardsequence(state, fields, now) {
		const id = toInt(fields[1])
		const column = toInt(fields[2])
		const name = nameField(fields, 3)
		if (id === undefined || column === undefined || name === undefined) return
		state.board(id, now).sequenceNames.set(column, name)
		state.changes.add(ChangeKind.BoardSequence)
	},

	// stateboardlayer*<board>*<layer>*<blind>*<solo>
	stateboardlayer(state, fields, now) {
		const id = toInt(fields[1])
		const layer = toInt(fields[2])
		if (id === undefined || layer === undefined || fields.length < 5) return
		state.board(id, now).layers.set(layer, { layer, blind: fields[3] === '1', solo: fields[4] === '1' })
		state.changes.add(ChangeKind.BoardLayer)
	},

	namescreen(state, fields) {
		const id = toInt(fields[1])
		const name = nameField(fields, 2)
		if (id === undefined || name === undefined) return
		state.screen(id).name = name
		state.changes.add(ChangeKind.Screen).add(ChangeKind.Structure)
	},

	screenstatus(state, fields) {
		const id = toInt(fields[1])
		const status = toInt(fields[2])
		if (id === undefined || status === undefined) return
		const s = state.screen(id)
		s.known = true
		s.status = status
		state.changes.add(ChangeKind.Screen)
	},

	// A parent removal also drops its name, layers and sequences.
	timelineremoved(state, fields) {
		if (state.timelines.delete(toInt(fields[1])))
			state.changes.add(ChangeKind.Timeline).add(ChangeKind.TimelineLayer).add(ChangeKind.Structure)
	},

	boardremoved(state, fields) {
		if (state.boards.delete(toInt(fields[1])))
			state.changes
				.add(ChangeKind.Board)
				.add(ChangeKind.BoardLayer)
				.add(ChangeKind.BoardSequence)
				.add(ChangeKind.Structure)
	},

	screenremoved(state, fields) {
		if (state.screens.delete(toInt(fields[1]))) state.changes.add(ChangeKind.Screen).add(ChangeKind.Structure)
	},

	timelinelayerremoved(state, fields) {
		const t = state.timelines.get(toInt(fields[1]))
		if (t?.layers.delete(`${toInt(fields[2])}*${toInt(fields[3])}`)) state.changes.add(ChangeKind.TimelineLayer)
	},

	boardlayerremoved(state, fields) {
		const b = state.boards.get(toInt(fields[1]))
		if (b?.layers.delete(toInt(fields[2]))) state.changes.add(ChangeKind.BoardLayer)
	},

	boardsequenceremoved(state, fields) {
		const b = state.boards.get(toInt(fields[1]))
		if (b?.sequenceNames.delete(toInt(fields[2]))) state.changes.add(ChangeKind.BoardSequence)
	},
}
