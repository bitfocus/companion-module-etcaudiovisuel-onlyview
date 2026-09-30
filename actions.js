import { Protocol, ScreenStatus } from './state.js'
import {
	findBoard,
	findBoardLayer,
	findScreen,
	findTimeline,
	findTimelineLayer,
	timelineLayerPart,
} from './feedbacks.js'
import { StateMode } from './upgrades.js'

// HH:MM:SS or HH:MM:SS:FF. Producer checks the frame against the show framerate.
const TIMECODE_REGEX_STRING = '/^\\d{1,2}:[0-5]\\d:[0-5]\\d(:\\d{1,3})?$/'
const TIMECODE_REGEX = /^\d{1,2}:[0-5]\d:[0-5]\d(:\d{1,3})?$/

// audio_types.h in Onlyview.
const VOLUME_MIN_DB = -80
const VOLUME_MAX_DB = 6

const TEST_PATTERN_CHOICES = [
	{ id: 0, label: 'None' },
	{ id: 1, label: 'Small pattern' },
	{ id: 2, label: 'Horizontal black level' },
	{ id: 3, label: 'Vertical black level' },
	{ id: 4, label: 'Tile' },
	{ id: 5, label: 'Onlyview logo' },
	{ id: 6, label: 'SMPTE HD color bar' },
	{ id: 7, label: 'SMPTE SD color bar' },
	{ id: 8, label: 'OSD' },
	{ id: 9, label: 'Framerate (CPU)' },
	{ id: 10, label: 'Framerate (GPU)' },
	{ id: 11, label: 'White' },
]

export default function (self) {
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
			self.log('warn', 'Command dropped, not connected to Producer: ' + str.trim())
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
		}
	}

	// Creates a number option for an Onlyview id or index.
	function idOption(idStr, labelStr, maxValue) {
		return { ...numberOption(idStr, labelStr, 1, maxValue, 1), asInteger: true }
	}

	// Onlyview parses the fade time in integer milliseconds.
	function fadeTimeMs(seconds) {
		return Math.max(0, Math.round(seconds * 1000))
	}

	// Onlyview divides the grand master by 100.
	function grandMasterValue(value) {
		return Math.min(100, Math.max(0, value))
	}

	// Producer asserts the audio volume range. Its UI shows 2 decimals.
	function volumeDb(value) {
		const clamped = Math.min(VOLUME_MAX_DB, Math.max(VOLUME_MIN_DB, Number(value)))
		return Math.round(clamped * 100) / 100
	}

	// Producer converts the timecode with the show framerate.
	function timecodeText(action, actionName) {
		const text = String(action.options.timecode ?? '').trim()
		if (!TIMECODE_REGEX.test(text)) {
			self.log('warn', actionName + ': invalid timecode "' + text + '", use HH:MM:SS or HH:MM:SS:FF')
			return undefined
		}
		// Only a Producer that replies to subscribe knows tc=.
		if (self.protocol === Protocol.Legacy) {
			self.log(
				'warn',
				actionName +
					': Producer did not reply to subscribe. If it is too old for timecodes in frames, it reads ' +
					text +
					' wrongly.',
			)
		}
		return text
	}

	// Empty or 0 means all the Displays.
	function sendDisplaysCommand(command, displayIdValue) {
		if (displayIdValue === undefined || displayIdValue === '' || Number(displayIdValue) === 0) {
			sendTcp(command + '\n')
			return
		}
		const displayId = Number(displayIdValue)
		if (!Number.isInteger(displayId) || displayId < 0) {
			self.log('warn', command + ': invalid Display Id "' + displayIdValue + '"')
			return
		}
		sendTcp(command + '*' + displayId + '\n')
	}

	function displayIdOrAllOption() {
		return { ...numberOption('displayId', 'Display Id (0 = all)', 0, 999, 0), asInteger: true }
	}

	function timecodeOption() {
		return {
			type: 'textinput',
			id: 'timecode',
			label: 'Timecode (HH:MM:SS or HH:MM:SS:FF)',
			default: '00:00:00:00',
			regex: TIMECODE_REGEX_STRING,
			useVariables: true,
			description: 'FF is a frame number, in the show framerate.',
		}
	}

	function volumeOption() {
		return {
			...numberOption('volume', 'Volume (dBFS)', VOLUME_MIN_DB, VOLUME_MAX_DB, 0),
			step: 0.01,
			clampValues: true,
		}
	}

	// The On / Off / Toggle option of the state actions.
	function modeOption(labelStr) {
		return {
			type: 'dropdown',
			id: 'mode',
			label: labelStr,
			choices: [
				{ id: StateMode.On, label: 'On' },
				{ id: StateMode.Off, label: 'Off' },
				{ id: StateMode.Toggle, label: 'Toggle' },
			],
			default: StateMode.On,
		}
	}

	// Returns the state to send, or undefined to send nothing.
	// `current` returns the current state, or undefined if Producer did not send it.
	function targetState(mode, actionName, current) {
		if (mode === StateMode.On) return true
		if (mode === StateMode.Off) return false
		if (mode !== StateMode.Toggle) {
			self.log('warn', actionName + ': invalid mode "' + mode + '", set it again in the button')
			return undefined
		}
		if (!self.state.subscribed) {
			self.log('warn', actionName + ': toggle needs the state of Producer. Producer is too old, or not connected.')
			return undefined
		}
		const value = current()
		if (value === undefined) {
			self.log('warn', actionName + ': toggle ignored, Producer did not send this state. Check the ids.')
			return undefined
		}
		return !value
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
			options: [displayIdOrAllOption()],
			callback: async (action) => {
				sendDisplaysCommand('online', action.options.displayId)
			},
		},

		offlineAction: {
			name: 'Offline Displays',
			options: [displayIdOrAllOption()],
			callback: async (action) => {
				sendDisplaysCommand('offline', action.options.displayId)
			},
		},

		displayOnlineStateAction: {
			name: 'Display online/offline',
			description: 'Toggle puts an offline or idle Display online, and any other Display offline.',
			options: [idOption('displayId', 'Display Id', 999), modeOption('Online state')],
			callback: async (action) => {
				const online = targetState(action.options.mode, 'Display online/offline', () => {
					const status = findScreen(self.state, action.options.displayId)?.status
					if (status === undefined) return undefined
					// Auto-reconnect cycles Error and Connecting: only offline stops it.
					return status !== ScreenStatus.Offline && status !== ScreenStatus.Idle
				})
				if (online === undefined) return
				sendTcp((online ? 'online*' : 'offline*') + action.options.displayId + '\n')
			},
		},

		quickkeyAction: {
			name: 'Launch quick key',

			options: [idOption('quickkeyId', 'Quick key Id', 999)],
			callback: async (action) => {
				const str = 'launchquickkey*' + action.options.quickkeyId + '\n'
				sendTcp(str)
			},
		},

		testPatternAction: {
			name: 'Test pattern',
			options: [dropDownOption('testPatternId', 'Test pattern', TEST_PATTERN_CHOICES, 0)],
			callback: async (action) => {
				const str = 'setpattern*' + action.options.testPatternId + '\n'
				sendTcp(str)
			},
		},

		overrideTestPatternAction: {
			name: 'Override test pattern on output',
			options: [
				idOption('displayId', 'Display Id', 999),
				idOption('outputId', 'Output', 99),
				dropDownOption('testPatternId', 'Test pattern', TEST_PATTERN_CHOICES, 0),
			],
			callback: async (action) => {
				// Onlyview's API expects output ids to start at 0.
				const output = action.options.outputId - 1
				const str =
					'setoverridepattern*' + action.options.displayId + '*' + output + '*' + action.options.testPatternId + '\n'
				sendTcp(str)
			},
		},

		shutdownMasterAction: {
			name: 'Shutdown Master',
			options: [],
			callback: async (action) => {
				const str = 'shutdownmaster\n'
				sendTcp(str)
			},
		},

		// - Timeline actions -

		timelinePlayAction: {
			name: 'Timeline play',
			options: [idOption('timelineId', 'Timeline Id', 99)],
			callback: async (action) => {
				const str = 'play*' + action.options.timelineId + '\n'
				sendTcp(str)
			},
		},

		timelinePauseAction: {
			name: 'Timeline pause',
			options: [idOption('timelineId', 'Timeline Id', 99)],
			callback: async (action) => {
				const str = 'locate*' + action.options.timelineId + '\n'
				sendTcp(str)
			},
		},

		timelinePlayPauseAction: {
			name: 'Timeline play/pause',
			description: 'Pauses the timeline if it plays, plays it otherwise.',
			options: [idOption('timelineId', 'Timeline Id', 99)],
			callback: async (action) => {
				const play = targetState(
					StateMode.Toggle,
					'Timeline play/pause',
					() => findTimeline(self.state, action.options.timelineId)?.playing,
				)
				if (play === undefined) return
				sendTcp((play ? 'play*' : 'locate*') + action.options.timelineId + '\n')
			},
		},

		timelineLocateAction: {
			name: 'Timeline locate',
			description: 'Goes to the timecode and pauses.',
			options: [idOption('timelineId', 'Timeline Id', 99), timecodeOption()],
			callback: async (action) => {
				const timecode = timecodeText(action, 'Timeline locate')
				if (timecode === undefined) return
				sendTcp('locate*' + action.options.timelineId + '*tc=' + timecode + '\n')
			},
		},

		timelineLocateAndPlayAction: {
			name: 'Timeline locate and play',
			description: 'Goes to the timecode and plays.',
			options: [idOption('timelineId', 'Timeline Id', 99), timecodeOption()],
			callback: async (action) => {
				const timecode = timecodeText(action, 'Timeline locate and play')
				if (timecode === undefined) return
				sendTcp('play*' + action.options.timelineId + '*tc=' + timecode + '\n')
			},
		},

		timelineOnOffStateAction: {
			name: 'Timeline ON/OFF state',
			options: [idOption('timelineId', 'Timeline Id', 99), modeOption('ON/OFF state')],
			callback: async (action) => {
				const on = targetState(
					action.options.mode,
					'Timeline ON/OFF state',
					() => findTimeline(self.state, action.options.timelineId)?.on,
				)
				if (on === undefined) return
				const str = 'settimelineon*' + action.options.timelineId + '*' + (on ? 1 : 0) + '\n'
				sendTcp(str)
			},
		},

		timelineGrandMasterAction: {
			name: 'Timeline grand master',
			options: [
				idOption('timelineId', 'Timeline Id', 99),
				{ ...numberOption('value', 'Grand master value', 0, 100, 100), clampValues: true },
				numberOption('fadeTime', 'Fade time (seconds)', 0, 99, 0),
			],
			callback: async (action) => {
				// Onlyview expects a fade time value in milliseconds.
				const fadeTime = fadeTimeMs(action.options.fadeTime)
				const str =
					'setgrandmaster*' +
					action.options.timelineId +
					'*' +
					grandMasterValue(action.options.value) +
					'*' +
					fadeTime +
					'\n'
				sendTcp(str)
			},
		},

		timelineLayerOnOffStateAction: {
			name: 'Timeline layer ON/OFF state',
			options: [
				idOption('timelineId', 'Timeline Id', 99),
				dropDownOption(
					'layerType',
					'Layer type',
					[
						{ id: 0, label: 'Command layer' },
						{ id: 1, label: 'Media layer' },
					],
					1,
				),
				idOption('layerId', 'Layer Id', 199),
				modeOption('ON/OFF state'),
			],
			callback: async (action) => {
				const { timelineId, layerType, layerId } = action.options
				const on = targetState(action.options.mode, 'Timeline layer ON/OFF state', () => {
					const layer = findTimelineLayer(self.state, timelineId, layerType, layerId)
					return layer && !layer.blind
				})
				if (on === undefined) return
				const ovLayerType = timelineLayerPart(action.options.layerType)
				// Onlyview expects the blind state, not the ON/OFF layer state.
				const state = on ? 0 : 1
				const str =
					'setlayerblind*' +
					action.options.timelineId +
					'*' +
					ovLayerType +
					'*' +
					action.options.layerId +
					'*' +
					state +
					'\n'
				sendTcp(str)
			},
		},

		timelineLayerSoloStateAction: {
			name: 'Timeline layer solo state',
			options: [
				idOption('timelineId', 'Timeline Id', 99),
				dropDownOption(
					'layerType',
					'Layer type',
					[
						{ id: 0, label: 'Command layer' },
						{ id: 1, label: 'Media layer' },
					],
					1,
				),
				idOption('layerId', 'Layer Id', 199),
				modeOption('Solo state'),
			],
			callback: async (action) => {
				const { timelineId, layerType, layerId } = action.options
				const solo = targetState(
					action.options.mode,
					'Timeline layer solo state',
					() => findTimelineLayer(self.state, timelineId, layerType, layerId)?.solo,
				)
				if (solo === undefined) return
				const ovLayerType = timelineLayerPart(action.options.layerType)
				const state = solo ? 1 : 0
				const str =
					'setlayersolo*' +
					action.options.timelineId +
					'*' +
					ovLayerType +
					'*' +
					action.options.layerId +
					'*' +
					state +
					'\n'
				sendTcp(str)
			},
		},

		// - Board actions -

		boardPlayAction: {
			name: 'Board play',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				const str = 'setBoardPlayState*' + action.options.boardId + '*0*1\n'
				sendTcp(str)
			},
		},

		boardPauseAction: {
			name: 'Board pause',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				const str = 'setBoardPlayState*' + action.options.boardId + '*0*0\n'
				sendTcp(str)
			},
		},

		boardPlayPauseAction: {
			name: 'Board play/pause',
			description: 'Pauses the board if it plays, plays it otherwise.',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				const play = targetState(
					StateMode.Toggle,
					'Board play/pause',
					() => findBoard(self.state, action.options.boardId)?.playing,
				)
				if (play === undefined) return
				sendTcp('setBoardPlayState*' + action.options.boardId + '*0*' + (play ? 1 : 0) + '\n')
			},
		},

		boardEnqueueSequenceAction: {
			name: 'Board enqueue sequence',
			options: [idOption('boardId', 'Board Id', 99), idOption('sequenceId', 'Sequence Id', 999)],
			callback: async (action) => {
				// Onlyview's API expects board sequences Id to start at 0.
				const sequence = action.options.sequenceId - 1
				const str = 'enqueueSequenceAndPreset*' + action.options.boardId + '*' + sequence + '*-1\n'
				sendTcp(str)
			},
		},

		boardEnqueueSequenceAndPresetAction: {
			name: 'Board enqueue sequence and preset',
			options: [
				idOption('boardId', 'Board Id', 99),
				idOption('sequenceId', 'Sequence Id', 999),
				idOption('presetId', 'Preset Id', 99),
			],
			callback: async (action) => {
				// Onlyview's API expects board sequences Id to start at 0.
				const sequence = action.options.sequenceId - 1
				const preset = action.options.presetId - 1
				const str = 'enqueueSequenceAndPreset*' + action.options.boardId + '*' + sequence + '*' + preset + '\n'
				sendTcp(str)
			},
		},

		boardPlaySequenceAction: {
			name: 'Board play sequence',
			options: [
				idOption('boardId', 'Board Id', 99),
				idOption('sequenceId', 'Sequence Id', 999),
				{ ...stateOption('overridePreset', 'Override preset'), default: false, disableAutoExpression: true },
				{ ...idOption('presetId', 'Preset Id', 99), isVisibleExpression: '$(options:overridePreset)' },
				{ ...stateOption('clearQueue', 'Clear queue'), default: false },
			],
			callback: async (action) => {
				// Onlyview's API expects board sequences and presets Id to start at 0.
				const sequence = action.options.sequenceId - 1
				// -1 means no preset override.
				const preset = action.options.overridePreset ? action.options.presetId - 1 : -1
				const clearQueue = action.options.clearQueue ? 1 : 0
				// allowCrossfade = 1, locator = 0 (main).
				const str = 'playBoard*' + action.options.boardId + '*' + sequence + '*1*0*' + preset + '*' + clearQueue + '\n'
				sendTcp(str)
			},
		},

		boardNextAction: {
			name: 'Board play next sequence',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				// Using '*0' as default argument for the last one.
				const str = 'boardPlayNext*' + action.options.boardId + '*0\n'
				sendTcp(str)
			},
		},

		boardNextSequenceAction: {
			name: 'Board play next sequence (sequence + 1)',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				// Using '*1' as default argument for the last one.
				const str = 'boardPlayNext*' + action.options.boardId + '*1\n'
				sendTcp(str)
			},
		},

		boardNextEnqueuedAction: {
			name: 'Board play next sequence (enqueued sequence)',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				// Using '*2' as default argument for the last one.
				const str = 'boardPlayNext*' + action.options.boardId + '*2\n'
				sendTcp(str)
			},
		},

		boardPreviousAction: {
			name: 'Board play previous sequence',
			options: [idOption('boardId', 'Board Id', 99)],
			callback: async (action) => {
				const str = 'boardPlayPrevious*' + action.options.boardId + '\n'
				sendTcp(str)
			},
		},

		boardOnOffStateAction: {
			name: 'Board ON/OFF state',
			options: [idOption('boardId', 'Board Id', 99), modeOption('ON/OFF state')],
			callback: async (action) => {
				const on = targetState(
					action.options.mode,
					'Board ON/OFF state',
					() => findBoard(self.state, action.options.boardId)?.on,
				)
				if (on === undefined) return
				const str = 'setBoardOn*' + action.options.boardId + '*' + (on ? 1 : 0) + '\n'
				sendTcp(str)
			},
		},

		boardGrandMasterAction: {
			name: 'Board grand master',
			options: [
				idOption('boardId', 'Board Id', 99),
				{ ...numberOption('value', 'Grand master value', 0, 100, 100), clampValues: true },
				numberOption('fadeTime', 'Fade time (seconds)', 0, 99, 0),
			],
			callback: async (action) => {
				// Buttons saved before the baoardId rename have no boardId.
				const boardId = Number(action.options.boardId)
				if (!Number.isInteger(boardId) || boardId < 1) {
					self.log('warn', 'Board grand master: invalid Board Id, set it again in the button')
					return
				}
				// Onlyview expects a fade time value in milliseconds.
				const fadeTime = fadeTimeMs(action.options.fadeTime)
				const str =
					'setBoardGrandMaster*' + boardId + '*' + grandMasterValue(action.options.value) + '*' + fadeTime + '\n'
				sendTcp(str)
			},
		},

		boardLayerOnOffStateAction: {
			name: 'Board layer ON/OFF state',
			options: [idOption('boardId', 'Board Id', 99), idOption('layerId', 'Layer Id', 199), modeOption('ON/OFF state')],
			callback: async (action) => {
				const on = targetState(action.options.mode, 'Board layer ON/OFF state', () => {
					const layer = findBoardLayer(self.state, action.options.boardId, action.options.layerId)
					return layer && !layer.blind
				})
				if (on === undefined) return
				// Onlyview's API expects board layers Id to start at 0.
				const layer = action.options.layerId - 1
				// Onlyview expects the blind state, not the ON/OFF layer state.
				const state = on ? 0 : 1
				const str = 'setBoardLayerBlind*' + action.options.boardId + '*' + layer + '*' + state + '\n'
				sendTcp(str)
			},
		},

		boardLayerSoloStateAction: {
			name: 'Board layer solo state',
			options: [idOption('boardId', 'Board Id', 99), idOption('layerId', 'Layer Id', 199), modeOption('Solo state')],
			callback: async (action) => {
				const solo = targetState(
					action.options.mode,
					'Board layer solo state',
					() => findBoardLayer(self.state, action.options.boardId, action.options.layerId)?.solo,
				)
				if (solo === undefined) return
				// Onlyview's API expects board layers Id to start at 0.
				const layer = action.options.layerId - 1
				const state = solo ? 1 : 0
				const str = 'setBoardLayerSolo*' + action.options.boardId + '*' + layer + '*' + state + '\n'
				sendTcp(str)
			},
		},

		// - Audio actions -

		audioOutputVolumeAction: {
			name: 'Audio output volume',
			options: [idOption('displayId', 'Display Id', 999), idOption('outputId', 'Output', 99), volumeOption()],
			callback: async (action) => {
				// Onlyview's API expects output ids to start at 0.
				const output = action.options.outputId - 1
				const str =
					'updatescreenoutputaudiovolume*' +
					action.options.displayId +
					'*' +
					output +
					'*' +
					volumeDb(action.options.volume) +
					'\n'
				sendTcp(str)
			},
		},

		audioChannelStateAction: {
			name: 'Audio channel state',
			description: 'Sets the volume, the mute and the test signal of the channel, all together.',
			options: [
				idOption('displayId', 'Display Id', 999),
				idOption('outputId', 'Output', 99),
				idOption('channel', 'Channel', 128),
				volumeOption(),
				{ ...stateOption('mute', 'Mute'), default: false },
				{ ...stateOption('signalTest', 'Play the test signal'), default: false },
			],
			callback: async (action) => {
				// Onlyview's API expects output and channel ids to start at 0.
				const output = action.options.outputId - 1
				const channel = action.options.channel - 1
				const mute = action.options.mute ? 1 : 0
				const signalTest = action.options.signalTest ? 1 : 0
				const str =
					'updateaudiochannelstate*' +
					action.options.displayId +
					'*' +
					output +
					'*' +
					channel +
					'*' +
					volumeDb(action.options.volume) +
					'*' +
					mute +
					'*' +
					signalTest +
					'\n'
				sendTcp(str)
			},
		},

		// - Action graph actions -

		actionGraphEventAction: {
			name: 'Trigger action graph event',
			description: 'Fires an "On Action" node.',
			options: [
				idOption('graphId', 'Action graph Id', 9999),
				{ ...numberOption('nodeId', 'Node Id', 0, 99999, 0), asInteger: true },
			],
			callback: async (action) => {
				const str = 'actionGraphNodeEvent*actionEvent*' + action.options.graphId + '*' + action.options.nodeId + '\n'
				sendTcp(str)
			},
		},
	})
}
