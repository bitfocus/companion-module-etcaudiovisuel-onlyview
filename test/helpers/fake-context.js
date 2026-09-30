import ModuleInstance from '../../main.js'

// Minimal stand-in for the context that Companion passes to the module.
// It records what the module reports, so tests can check it.
export function createFakeContext() {
	const recorded = {
		statuses: [],
		logs: [],
		actionDefinitions: {},
		feedbackDefinitions: {},
		variableDefinitions: {},
		variableValues: {},
		checkedFeedbacks: [],
	}

	global.COMPANION_LOGGER = (_source, level, message) => recorded.logs.push({ level, message })

	const context = {
		_isInstanceContext: true,
		id: 'test-instance',
		label: 'onlyview',
		upgradeScripts: [],
		sharedUdpSocketHandlers: new Map(),
		saveConfig: () => {},
		updateStatus: (status, message) => recorded.statuses.push({ status, message }),
		oscSend: () => {},
		recordAction: () => {},
		setActionDefinitions: (defs) => (recorded.actionDefinitions = defs),
		subscribeActions: () => {},
		unsubscribeActions: () => {},
		setFeedbackDefinitions: (defs) => (recorded.feedbackDefinitions = defs),
		unsubscribeFeedbacks: () => {},
		checkFeedbacks: (types) => recorded.checkedFeedbacks.push(...types),
		checkAllFeedbacks: () => {},
		checkFeedbacksById: () => {},
		setPresetDefinitions: () => {},
		setCompositeElementDefinitions: () => {},
		setVariableDefinitions: (defs) => (recorded.variableDefinitions = defs),
		setVariableValues: (values) => Object.assign(recorded.variableValues, values),
		getVariableValue: (id) => recorded.variableValues[id],
		sharedUdpSocketJoin: async () => '',
		sharedUdpSocketLeave: async () => {},
		sharedUdpSocketSend: async () => {},
	}

	return { context, recorded }
}

// Creates a module instance outside Companion.
export async function createModule(config) {
	const { context, recorded } = createFakeContext()
	const instance = new ModuleInstance(context)
	await instance.init(config)
	return { instance, recorded }
}

// Runs an action callback like Companion does, with already-resolved options.
export async function runAction(recorded, actionId, options) {
	const definition = recorded.actionDefinitions[actionId]
	if (!definition) throw new Error(`Unknown action ${actionId}`)
	const defaults = Object.fromEntries(definition.options.map((opt) => [opt.id, opt.default]))
	await definition.callback({ id: 'a1', controlId: 'c1', actionId, options: { ...defaults, ...options } }, {})
}
