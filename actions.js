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

    function numberOption(idStr, labelStr, minValue, maxValue, defaultValue) {
        return {
            type: 'number',
            id: idStr,
            label: labelStr,
            default: defaultValue,
            min: minValue,
            max: maxValue,
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
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
            ],
            callback: async (action) => {
                const str = 'play*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },

        timelinePauseAction: {
            name: 'Timeline pause',
            options: [
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
            ],
            callback: async(action) => {
                const str = 'locate*' + action.options.timelineId + '\n'
                sendTcp(str)
            },
        },

        timelineOnOffStateAction: {
            name: 'Timeline ON/OFF state',
            options: [
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                const state = action.options.state ? 1 : 0
                const str = 'settimelineon*' + action.options.timelineId + '*' + state + '\n'
                sendTcp(str)
            },
        },

        timelineGrandMasterAction: {
            name: 'Timeline grand master',
            options: [
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
                numberOption('value', 'Grand master value', 0, 100, 100),
                numberOption('fadeTime', 'Fade time (seconds)', 0, 99, 0),
            ],
            callback: async(action) => {
                // Onlyview expects a fade time value in milliseconds.
                const fadeTime = action.options.fadeTime * 1000
                const str = 'setgrandmaster*' + action.options.timelineId + '*' +
                    action.options.value + '*' + fadeTime + '\n'
                sendTcp(str)
            },
        },

        boardPlayColumnAction: {
            name: 'Board play column',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('columnId', 'Column Id', 1, 99, 1),
            ],
            callback: async(action) => {
                // Onlyview's API expects board columns Id to start at 0.
                const column = action.options.columnId - 1
                // Using '*1*0' as default arguments for the two last one.
                const str = 'playBoard*' + action.options.boardId + '*' + column + '*1*0\n'
                sendTcp(str)
            },
        },

        boardNextAction: {
            name: 'Board play next sequence',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
            ],
            callback: async(action) => {
                const str = 'boardPlayNext*' + action.options.boardId + '\n'
                sendTcp(str)
            },
        },

        boardOnOffStateAction: {
            name: 'Board ON/OFF state',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                const state = action.options.state ? 1 : 0
                const str = 'setBoardOn*' + action.options.boardId + '*' + state + '\n'
                sendTcp(str)
            },
        },

        quickkeyAction: {
            name: 'Quick key',
            options: [
                numberOption('quickkeyId', 'Quick key Id', 1, 999, 1),
            ],
            callback: async(action) => {
                const str = 'launchquickkey*' + action.options.quickkeyId + '\n'
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
