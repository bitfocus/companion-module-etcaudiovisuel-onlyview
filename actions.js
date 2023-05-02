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

    function dropDownOption(idStr, labelStr, availableChoices, defaultChoice) {
        return {
            type: 'dropdown',
            id: idStr,
            label: labelStr,
            choices: availableChoices,
            default: defaultChoice,
        }
    }

    self.setActionDefinitions({
        onlineAction: {
            name: 'Online Displays',
            options: [],
            callback: async(action) => {
                const str = 'online\n'
                sendTcp(str)
            },
        },

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

        testPatternAction: {
            name: 'Test pattern',
            options: [
                dropDownOption('testPatternId', 'Test pattern', [
                    {id: 0, label: 'None'},
                    {id: 1, label: 'Small pattern'},
                    {id: 2, label: 'Horizontal black level'},
                    {id: 3, label: 'Vertical black level'},
                    {id: 4, label: 'Tile'},
                    {id: 5, label: 'Onlyview logo'},
                    {id: 6, label: 'SMPTE HD color bar'},
                    {id: 7, label: 'SMPTE SD color bar'},
                    {id: 8, label: 'OSD'},
                    {id: 9, label: 'Framerate (CPU)'},
                    {id: 10, label: 'Framerate (GPU)'},
                    {id: 11, label: 'White'}],
                    0)
            ],
            callback: async(action) => {
                const str = 'setpattern*' + action.options.testPatternId + '\n'
                sendTcp(str)
            },
        },
    })
}
