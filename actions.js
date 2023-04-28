module.exports = function (self) {
    function sendTcp(str) {
        /* Create a binary buffer pre-encoded 'latin1' (8bit no change bytes) sending a string.
         * Assumes 'utf8' encoding which then escapes character values over 0x7F and destroys
         * the 'binary' context.
         */
        const buffer = Buffer.from(str, 'latin1')

        if (self.socket !== undefined && self.socket.isConnected) {
            self.socket.send(buffer)
        } else {
            self.log('debug', 'Socket not connected :(')
        }
    }

    function numberOption(idStr, labelStr) {
        return {
            type: 'number',
            id: idStr,
            label: labelStr,
            default: 1,
            min: 1,
            max: 999,
            useVariables: true,
        }
    }

    function stateOption(idStr, labelStr) {
        return {
            type: 'checkbox',
            id: idStr,
            label: labelStr,
            default: true,
        }
    }

    self.setActionDefinitions({
        timelinePlayAction: {
            name: 'Timeline play',
            options: [
                numberOption('timelineId', 'Timeline Id'),
            ],
            callback: async (action) => {
                const str = 'play*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },

        timelinePauseAction: {
            name: 'Timeline pause',
            options: [
                numberOption('timelineId', 'Timeline Id'),
            ],
            callback: async(action) => {
                const str = 'locate*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },

        timelineOnOffStateAction: {
            name: 'Timeline ON/OFF state',
            options: [
                numberOption('timelineId', 'Timeline Id'),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                const state = action.options.state ? 1 : 0
                const str = 'settimelineon*' + action.options.timelineId + '*' + state + '\n'
                sendTcp(str)
            },
        },
    })
}
