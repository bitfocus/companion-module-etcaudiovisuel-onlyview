import { InstanceBase, Regex, InstanceStatus, TCPHelper } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import UpdateActions from './actions.js'

export { UpgradeScripts }

// Producer always listens on this port.
const DEFAULT_PORT = 3055

// A line longer than this is garbage: drop it instead of growing forever.
const MAX_LINE_LENGTH = 1024 * 1024

export default class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.updateActions()

		await this.configUpdated(config)
	}

	async destroy() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}
	}

	async configUpdated(config) {
		this.config = config
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

	initTcp() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}
		this.resetReceiveBuffer()
		this.lastErrorMessage = undefined

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig)
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		const port = Number(this.config.port) || DEFAULT_PORT
		this.socket = new TCPHelper(this.config.host, port)

		this.socket.on('status_change', (status, message) => {
			this.updateStatus(status, message)
		})

		this.socket.on('connect', () => {
			this.lastErrorMessage = undefined
			this.resetReceiveBuffer()
			this.log('info', `Connected to Producer at ${this.config.host}:${port}`)
		})

		// TCPHelper retries every 2 s. Log each different error only once.
		this.socket.on('error', (err) => {
			if (err.message === this.lastErrorMessage) return
			this.lastErrorMessage = err.message
			this.log('error', 'Network error: ' + err.message)
		})

		this.socket.on('data', (data) => this.onData(data))
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
	}

	handleLine(line) {
		this.log('debug', 'Unhandled message from Producer: ' + line)
	}
}
