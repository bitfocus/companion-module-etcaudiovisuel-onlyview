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

    self.setActionDefinitions({
        timelinePlayAction: {
            name: 'Timeline play',
            options: [
                {
                    type: 'number',
                    id: 'timelineId',
                    label: 'Timeline Id',
                    default: '1',
                    min: 1,
                    max: 99,
                    useVariables: true,
                },
            ],
            callback: async (action) => {
                const str = 'play*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },

        timelinePauseAction: {
            name: 'Timeline pause',
            options: [
                {
                    type: 'number',
                    id: 'timelineId',
                    label: 'Timeline Id',
                    default: '1',
                    min: 1,
                    max: 99,
                    useVariables: true,
                },
            ],
            callback: async(action) => {
                const str = 'locate*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },
    })
}
