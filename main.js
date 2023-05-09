const { InstanceBase, Regex, runEntrypoint, InstanceStatus, TCPHelper } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
// const UpdateFeedbacks = require('./feedbacks')
// const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
    constructor(internal) {
        super(internal)
    }

    async init(config) {
        this.updateStatus(InstanceStatus.Ok)

        this.updateActions()
        // this.updateFeedbacks()
        // this.updateVariableDefinitions()

        await this.configUpdated(config)
    }

    async destroy() {
        if (this.socket) {
            this.socket.destroy()
        } else {
            this.updateStatus(InstanceStatus.Disconnected)
        }
    }

    async configUpdated(config) {
        if (this.socket) {
            this.socket.destroy()
            delete this.socket
        }

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
            },
        ]
    }

    updateActions() {
        UpdateActions(this)
    }

    /*updateFeedbacks() {
        UpdateFeedbacks(this)
    }*/

    /*updateVariableDefinitions() {
        UpdateVariableDefinitions(this)
    }*/

    initTcp() {
        if (this.socket) {
            this.socket.destroy()
            delete this.socket
        }

        this.updateStatus(InstanceStatus.Connecting)

        if (this.config.host) {
            this.socket = new TCPHelper(this.config.host, this.config.port)

            this.socket.on('status_change', (status, message) => {
                this.updateStatus(status, message)
            })

            this.socket.on('error', (err) => {
                this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
                this.log('error', 'Network error: ' + err.message)
            })
        } else {
            this.updateStatus(InstanceStatus.BadConfig)
        }
    }
}

runEntrypoint(ModuleInstance, UpgradeScripts)
