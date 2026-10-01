import { InstanceBase, Regex, InstanceStatus, TCPHelper } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import UpdateActions from './actions.js'
import UpdateFeedbacks, { feedbacksForChanges } from './feedbacks.js'
import { OnlyviewState, ChangeKind, Protocol } from './state.js'
import { definedObjects, variableDefinitions, variableValues } from './variables.js'
import { presetDefinitions, presetModel } from './presets.js'

export { UpgradeScripts }

// Producer always listens on this port.
const DEFAULT_PORT = 3055

// A line longer than this is garbage: drop it instead of growing forever.
const MAX_LINE_LENGTH = 1024 * 1024

const SUBSCRIBE_VERSION = 1

const DEFAULT_TIMING = Object.freeze({
	// Wait this long for `subscribed`, then treat Producer as too old.
	handshakeMs: 2000,
	checkaliveMs: 2000,
	// No line from Producer for this long: the connection is lost.
	aliveTimeoutMs: 5000,
	// Refresh rate of the timecode variables while something plays.
	clockMs: 100,
	// The variable definitions and presets wait for this long without a structure change.
	definitionsMs: 250,
	// But never longer than this after the first change.
	definitionsMaxMs: 2000,
})

export default class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.timing = { ...DEFAULT_TIMING }
		// Monotonic clock, in ms. Tests replace it.
		this.now = () => performance.now()
		this.state = new OnlyviewState()
		this.protocol = Protocol.None
		this.noReply = false
		this.tcpStatus = InstanceStatus.Connecting
		this.tcpMessage = undefined
		this.variableObjects = definedObjects(this.state)
		this.definitionsKey = undefined
		this.lastValues = {}
	}

	async init(config) {
		this.updateActions()
		this.updateFeedbacks()
		this.updateDefinitions()

		await this.configUpdated(config)
	}

	async destroy() {
		this.stopConnectionTimers()
		this.stopClock()
		clearTimeout(this.definitionsTimer)
		delete this.definitionsTimer
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}
	}

	async configUpdated(config) {
		this.config = config
		this.noReply = false
		this.legacyLogged = false
		// The presets contain the connection label, which may have changed.
		this.updatePresets()
		this.initTcp()
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Producer IP',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Producer Port',
				width: 4,
				regex: Regex.PORT,
				default: String(DEFAULT_PORT),
				tooltip: `Producer always uses ${DEFAULT_PORT}. Change it only for NAT or port forwarding.`,
			},
		]
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	// Connected, and Producer replies, with or without the state push.
	isProducerAlive() {
		return (
			this.tcpStatus === InstanceStatus.Ok &&
			!this.noReply &&
			(this.protocol === Protocol.Subscribed || this.protocol === Protocol.Legacy)
		)
	}

	initTcp() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}
		this.onDisconnected()
		this.resetReceiveBuffer()
		this.lastErrorMessage = undefined

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig)
			return
		}

		this.setTcpStatus(InstanceStatus.Connecting)

		const port = Number(this.config.port) || DEFAULT_PORT
		this.socket = new TCPHelper(this.config.host, port)

		this.socket.on('status_change', (status, message) => {
			if (status !== InstanceStatus.Ok) this.onDisconnected()
			this.setTcpStatus(status, message)
		})

		this.socket.on('connect', () => {
			this.lastErrorMessage = undefined
			this.resetReceiveBuffer()
			// Reconnections after a heartbeat timeout repeat every few seconds.
			if (!this.noReply) this.log('info', `Connected to Producer at ${this.config.host}:${port}`)
			this.onConnected()
		})

		// TCPHelper retries every 2 s. Log each different error only once.
		this.socket.on('error', (err) => {
			this.onDisconnected()
			if (err.message === this.lastErrorMessage) return
			this.lastErrorMessage = err.message
			this.log('error', 'Network error: ' + err.message)
		})

		this.socket.on('end', () => this.onDisconnected())

		this.socket.on('data', (data) => this.onData(data))
	}

	// Sends a protocol line. Unlike the actions, it does not warn when not connected.
	sendLine(line) {
		if (this.socket?.isConnected) this.socket.send(line + '\n')
	}

	setTcpStatus(status, message) {
		this.tcpStatus = status
		this.tcpMessage = message
		this.refreshStatus()
		this.flushState()
	}

	// Reports ChangeKind.Connection when the connection or the protocol changes.
	markConnectionChange() {
		const key = `${this.tcpStatus}|${this.protocol}|${this.noReply}`
		if (key === this.connectionKey) return
		this.connectionKey = key
		this.state.changes.add(ChangeKind.Connection)
	}

	refreshStatus() {
		this.markConnectionChange()
		if (this.tcpStatus !== InstanceStatus.Ok) {
			this.updateStatus(this.tcpStatus, this.tcpMessage)
		} else if (this.noReply) {
			this.updateStatus(InstanceStatus.UnknownWarning, 'No reply from Producer. Is "Accept remote commands" on?')
		} else if (this.protocol === Protocol.Legacy) {
			this.updateStatus(
				InstanceStatus.UnknownWarning,
				'Producer too old for variables, or "Accept remote commands" is off',
			)
		} else {
			this.updateStatus(InstanceStatus.Ok)
		}
	}

	onConnected() {
		this.stopConnectionTimers()
		this.protocol = Protocol.Pending
		this.lastReplyAt = this.now()
		this.lastCheckaliveAt = this.now()
		this.sendLine('subscribe*' + SUBSCRIBE_VERSION)
		this.handshakeTimer = setTimeout(() => this.onHandshakeTimeout(), this.timing.handshakeMs)
		this.heartbeatTimer = setInterval(() => this.heartbeat(), Math.min(1000, this.timing.checkaliveMs))
		this.markConnectionChange()
		this.flushState()
	}

	// Idempotent: TCPHelper reports a lost connection with several events.
	onDisconnected() {
		this.stopConnectionTimers()
		this.protocol = Protocol.None
		this.markConnectionChange()
		this.clearState()
	}

	stopConnectionTimers() {
		clearTimeout(this.handshakeTimer)
		clearInterval(this.heartbeatTimer)
		delete this.handshakeTimer
		delete this.heartbeatTimer
	}

	onHandshakeTimeout() {
		delete this.handshakeTimer
		if (this.protocol !== Protocol.Pending) return
		this.setLegacy()
		this.flushState()
	}

	setLegacy() {
		this.protocol = Protocol.Legacy
		if (!this.legacyLogged) {
			this.legacyLogged = true
			this.log(
				'warn',
				'Producer did not reply to subscribe: it is too old for variables, or "Accept remote commands" is off. ' +
					'The actions still work, except the locates with a timecode in frames.',
			)
		}
		this.refreshStatus()
	}

	heartbeat() {
		const now = this.now()
		if (now - this.lastReplyAt > this.timing.aliveTimeoutMs) {
			this.onHeartbeatTimeout()
			return
		}
		if (now - this.lastCheckaliveAt >= this.timing.checkaliveMs) {
			this.lastCheckaliveAt = now
			this.sendLine('checkalive')
		}
	}

	onHeartbeatTimeout() {
		if (!this.noReply) {
			this.noReply = true
			this.log('warn', `No reply from Producer for ${this.timing.aliveTimeoutMs / 1000} s, reconnecting`)
		}
		this.initTcp()
	}

	resetReceiveBuffer() {
		this.receiveBuffer = Buffer.alloc(0)
		this.discardingLine = false
	}

	onData(data) {
		this.receiveBuffer = Buffer.concat([this.receiveBuffer, data])

		let newline
		while ((newline = this.receiveBuffer.indexOf(0x0a)) !== -1) {
			const line = this.receiveBuffer.subarray(0, newline).toString('utf8').replace(/\r$/, '')
			this.receiveBuffer = this.receiveBuffer.subarray(newline + 1)
			if (this.discardingLine) {
				this.discardingLine = false
				continue
			}
			if (line.length > 0) this.handleLine(line)
		}

		if (this.receiveBuffer.length > MAX_LINE_LENGTH) {
			if (!this.discardingLine) this.log('warn', 'Dropping an oversized message from Producer')
			this.discardingLine = true
			this.receiveBuffer = Buffer.alloc(0)
		}

		// One batch of updates per packet: a snapshot has hundreds of lines.
		this.flushState()
	}

	handleLine(line) {
		const now = this.now()
		this.lastReplyAt = now
		if (this.noReply) {
			this.noReply = false
			this.refreshStatus()
		}

		if (line === 'alive') return

		if (line === 'subscribed' || line.startsWith('subscribed*')) {
			this.onSubscribed(line.split('*')[1])
			return
		}

		// State lines only count inside a subscription.
		if (this.state.subscribed && this.state.handleLine(line, now)) return

		this.log('debug', 'Unhandled message from Producer: ' + line)
	}

	onSubscribed(versionText) {
		clearTimeout(this.handshakeTimer)
		delete this.handshakeTimer
		// Version 1 is the first one with the state push.
		const version = /^\d+$/.test(versionText ?? '') ? Number(versionText) : 0
		if (version < SUBSCRIBE_VERSION) {
			this.state.clear()
			this.setLegacy()
			return
		}
		this.protocol = Protocol.Subscribed
		this.legacyLogged = false
		// A snapshot follows. It replaces everything.
		this.state.startSubscription()
		this.refreshStatus()
	}

	clearState() {
		this.state.clear()
		this.flushState()
	}

	flushState() {
		const changes = this.state.takeChanges()
		if (changes.size === 0) return
		if (changes.has(ChangeKind.Structure) || changes.has(ChangeKind.BoardSequence)) this.scheduleDefinitions()
		this.updateVariables()
		this.updateClock()
		this.stateChanged(changes)
	}

	// `changes` is a Set of ChangeKind.
	stateChanged(changes) {
		const ids = feedbacksForChanges(changes)
		if (ids.length > 0) this.checkFeedbacks(...ids)
	}

	// Trailing debounce: a snapshot that arrives in several packets builds once, from the full show.
	scheduleDefinitions() {
		// Real time, like the timers. Tests replace `this.now` for the clocks.
		const now = performance.now()
		if (!this.definitionsTimer) this.definitionsFirstChangeAt = now
		clearTimeout(this.definitionsTimer)
		const maxDelay = this.definitionsFirstChangeAt + this.timing.definitionsMaxMs - now
		this.definitionsTimer = setTimeout(
			() => {
				delete this.definitionsTimer
				this.updateDefinitions()
			},
			Math.max(0, Math.min(this.timing.definitionsMs, maxDelay)),
		)
	}

	updateDefinitions() {
		// Without a subscription, keep the last ids: their variables show blank values.
		if (this.state.subscribed || this.definitionsKey === undefined) {
			const defs = variableDefinitions(this.state)
			const key = JSON.stringify(defs)
			if (key !== this.definitionsKey) {
				this.definitionsKey = key
				this.variableObjects = definedObjects(this.state)
				this.setVariableDefinitions(defs)
				for (const id of Object.keys(this.lastValues)) if (!(id in defs)) delete this.lastValues[id]
			}
		}
		this.updateVariables()
		this.updatePresets()
	}

	updatePresets() {
		// Like the variables: without a subscription, keep the last ids.
		if (this.state.subscribed || this.presetObjects === undefined) this.presetObjects = presetModel(this.state)
		const key = JSON.stringify([this.label, this.presetObjects])
		if (key === this.presetsKey) return
		this.presetsKey = key
		const { structure, presets } = presetDefinitions(this.presetObjects, this.label)
		this.setPresetDefinitions(structure, presets)
	}

	// Sends only the values that changed.
	updateVariables() {
		const values = variableValues(this.state, this.variableObjects, this.now())
		const changed = {}
		let count = 0
		for (const [id, value] of Object.entries(values)) {
			if (this.lastValues[id] === value) continue
			this.lastValues[id] = value
			changed[id] = value
			count++
		}
		if (count > 0) this.setVariableValues(changed)
	}

	// Producer does not send positions: the module runs the clocks while something plays.
	updateClock() {
		if (!this.state.isAnyPlaying()) {
			this.stopClock()
		} else if (!this.clockTimer) {
			this.clockTimer = setInterval(() => this.updateVariables(), this.timing.clockMs)
		}
	}

	stopClock() {
		clearInterval(this.clockTimer)
		delete this.clockTimer
	}
}
