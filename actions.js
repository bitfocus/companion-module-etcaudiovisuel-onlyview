module.exports = function (self) {
    // Sends a network message using the TCP socket.
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

    // Creates a number option giving the desired parameters.
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

    // Creates a state (boolean) option giving the desired parameters.
    function stateOption(idStr, labelStr) {
        return {
            type: 'checkbox',
            id: idStr,
            label: labelStr,
            default: true,
        }
    }

    // Creates a drop down option giving the desired parameters.
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

        // - General actions -

        onlineAction: {
            name: 'Online Displays',
            options: [],
            callback: async(action) => {
                const str = 'online\n'
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

        shutdownMasterAction: {
            name: 'Shutdown Master',
            options: [],
            callback: async(action) => {
                const str = 'shutdownmaster\n'
                sendTcp(str)
            },
        },

        // - Timeline actions -

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

        timelineLayerOnOffStateAction: {
            name: 'Timeline layer ON/OFF state',
            options: [
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
                dropDownOption('layerType', 'Layer type', [
                    {id: 0, label: 'Command layer'},
                    {id: 1, label: 'Media layer'}],
                    1),
                numberOption('layerId', 'Layer Id', 1, 199, 1),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                // Onlyview expects to receive 2 for the media layer type.
                const ovLayerType = action.options.layerType == 1 ? 2 : 0
                // Onlyview expects the blind state, not the ON/OFF layer state.
                const state = action.options.state ? 0 : 1
                const str = 'setlayerblind*' + action.options.timelineId + '*' + ovLayerType +
                    '*' + action.options.layerId + '*' + state + '\n'
                sendTcp(str)
            },
        },

        timelineLayerSoloStateAction: {
            name: 'Timeline layer solo state',
            options: [
                numberOption('timelineId', 'Timeline Id', 1, 99, 1),
                dropDownOption('layerType', 'Layer type', [
                    {id: 0, label: 'Command layer'},
                    {id: 1, label: 'Media layer'}],
                    1),
                numberOption('layerId', 'Layer Id', 1, 199, 1),
                stateOption('state', 'Solo state'),
            ],
            callback: async(action) => {
                // Onlyview expects to receive 2 for the media layer type.
                const ovLayerType = action.options.layerType == 1 ? 2 : 0
                const state = action.options.state ? 1 : 0
                const str = 'setlayersolo*' + action.options.timelineId + '*' + ovLayerType +
                    '*' + action.options.layerId + '*' + state + '\n'
                sendTcp(str)
            },
        },

        // - Board actions -

        boardPlayAction: {
            name: 'Board play',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
            ],
            callback: async (action) => {
                const str = 'setBoardPlayState*' + action.options.boardId + '*0*1\n'
                sendTcp(str)
            },
        },

        boardPauseAction: {
            name: 'Board pause',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
            ],
            callback: async (action) => {
                const str = 'setBoardPlayState*' + action.options.boardId + '*0*0\n'
                sendTcp(str)
            },
        },

        boardEnqueueSequenceAction: {
            name: 'Board enqueue sequence',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('sequenceId', 'Sequence Id', 1, 99, 1),
            ],
            callback: async(action) => {
                // Onlyview's API expects board sequences Id to start at 0.
                const sequence = action.options.sequenceId - 1
                const str = 'enqueueSequenceAndPreset*' + action.options.boardId + '*' +
                    sequence + '*-1\n'
                sendTcp(str)
            },
        },

        boardEnqueueSequenceAndPresetAction: {
            name: 'Board enqueue sequence and preset',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('sequence', 'Sequence Id', 1, 99, 1),
                numberOption('presetId', 'Preset Id', 1, 99, 1),
            ],
            callback: async(action) => {
                // Onlyview's API expects board sequences Id to start at 0.
                const sequence = action.options.sequenceId - 1
                const preset = action.options.presetId - 1
                const str = 'enqueueSequenceAndPreset*' + action.options.boardId + '*' +
                    sequence + '*' + preset + '\n'
                sendTcp(str)
            },
        },

        boardPlaySequenceAction: {
            name: 'Board play sequence',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('sequenceId', 'Sequence Id', 1, 99, 1),
            ],
            callback: async(action) => {
                // Onlyview's API expects board sequences Id to start at 0.
                const sequence = action.options.sequenceId - 1
                // Using '*1*0' as default arguments for the two last one.
                const str = 'playBoard*' + action.options.boardId + '*' + sequence + '*1*0\n'
                sendTcp(str)
            },
        },

        boardNextAction: {
            name: 'Board play next sequence',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
            ],
            callback: async(action) => {
                // Using '*0' as default argument for the last one.
                const str = 'boardPlayNext*' + action.options.boardId + '*0\n'
                sendTcp(str)
            },
        },

        boardPreviousAction: {
            name: 'Board play previous sequence',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
            ],
            callback: async(action) => {
                const str = 'boardPlayPrevious*' + action.options.boardId + '\n'
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

        boardGrandMasterAction: {
            name: 'Board grand master',
            options: [
                numberOption('baoardId', 'Board Id', 1, 99, 1),
                numberOption('value', 'Grand master value', 0, 100, 100),
                numberOption('fadeTime', 'Fade time (seconds)', 0, 99, 0),
            ],
            callback: async(action) => {
                // Onlyview expects a fade time value in milliseconds.
                const fadeTime = action.options.fadeTime * 1000
                const str = 'setBoardGrandMaster*' + action.options.baoardId + '*' +
                    action.options.value + '*' + fadeTime + '\n'
                sendTcp(str)
            },
        },

        boardLayerOnOffStateAction: {
            name: 'Board layer ON/OFF state',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('layerId', 'Layer Id', 1, 199, 1),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                // Onlyview's API expects board layers Id to start at 0.
                const layer = action.options.layerId - 1
                // Onlyview expects the blind state, not the ON/OFF layer state.
                const state = action.options.state ? 0 : 1
                const str = 'setBoardLayerBlind*' + action.options.boardId + '*' +
                layer + '*' + state + '\n'
                sendTcp(str)
            },
        },

        boardLayerSoloStateAction: {
            name: 'Board layer solo state',
            options: [
                numberOption('boardId', 'Board Id', 1, 99, 1),
                numberOption('layerId', 'Layer Id', 1, 199, 1),
                stateOption('state', 'ON/OFF state'),
            ],
            callback: async(action) => {
                // Onlyview's API expects board layers Id to start at 0.
                const layer = action.options.layerId - 1
                const state = action.options.state ? 1 : 0
                const str = 'setBoardLayerSolo*' + action.options.boardId + '*' +
                layer + '*' + state + '\n'
                sendTcp(str)
            },
        },
    })
}
