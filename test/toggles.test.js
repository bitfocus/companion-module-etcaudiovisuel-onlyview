import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createModule, runAction } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'
import { Protocol } from '../state.js'

// Each object exists twice: once in each state.
const SNAPSHOT = [
	'timelinestate*1*1*0*100*1*',
	'timelinelayerstate*1*2*1*0*0',
	'timelinelayerstate*1*2*2*1*1',
	'timelinelayerstate*1*0*1*1*0',
	'timelinestate*2*0*0*100*0*',
	'boardstate*1*1*0*100*1*0*-1*-1*1000*',
	'boardlayerstate*1*0*0*0',
	'boardlayerstate*1*1*1*1',
	'boardstate*2*0*0*100*0*-1*-1*-1*-1*',
	'screenstate*1*3*',
	'screenstate*2*1*',
	'screenstate*3*4*',
	'screenstate*4*2*',
	'screenstate*5*0*',
]

// [actionId, options, expected line]
const TOGGLES = [
	['timelinePlayPauseAction', { timelineId: 1 }, 'locate*1'],
	['timelinePlayPauseAction', { timelineId: 2 }, 'play*2'],
	['timelineOnOffStateAction', { timelineId: 1 }, 'settimelineon*1*0'],
	['timelineOnOffStateAction', { timelineId: 2 }, 'settimelineon*2*1'],
	// ON = not blind. The action sends the blind state.
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 1, layerId: 1 }, 'setlayerblind*1*2*1*1'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 1, layerId: 2 }, 'setlayerblind*1*2*2*0'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 0, layerId: 1 }, 'setlayerblind*1*0*1*0'],
	['timelineLayerSoloStateAction', { timelineId: 1, layerType: 1, layerId: 1 }, 'setlayersolo*1*2*1*1'],
	['timelineLayerSoloStateAction', { timelineId: 1, layerType: 1, layerId: 2 }, 'setlayersolo*1*2*2*0'],
	['boardPlayPauseAction', { boardId: 1 }, 'setBoardPlayState*1*0*0'],
	['boardPlayPauseAction', { boardId: 2 }, 'setBoardPlayState*2*0*1'],
	['boardOnOffStateAction', { boardId: 1 }, 'setBoardOn*1*0'],
	['boardOnOffStateAction', { boardId: 2 }, 'setBoardOn*2*1'],
	// Board layers are 1-based in the options, 0-based in Producer.
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 1 }, 'setBoardLayerBlind*1*0*1'],
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 2 }, 'setBoardLayerBlind*1*1*0'],
	['boardLayerSoloStateAction', { boardId: 1, layerId: 1 }, 'setBoardLayerSolo*1*0*1'],
	['boardLayerSoloStateAction', { boardId: 1, layerId: 2 }, 'setBoardLayerSolo*1*1*0'],
	// Offline and idle go online. Connected, connecting and error go offline.
	['displayOnlineStateAction', { displayId: 1 }, 'offline*1'],
	['displayOnlineStateAction', { displayId: 2 }, 'online*2'],
	['displayOnlineStateAction', { displayId: 3 }, 'offline*3'],
	['displayOnlineStateAction', { displayId: 4 }, 'offline*4'],
	['displayOnlineStateAction', { displayId: 5 }, 'online*5'],
]

// Toggles on objects that Producer did not send.
const UNKNOWN = [
	['timelinePlayPauseAction', { timelineId: 9 }],
	['timelineOnOffStateAction', { timelineId: 9 }],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 0, layerId: 2 }],
	['timelineLayerSoloStateAction', { timelineId: 9, layerType: 1, layerId: 1 }],
	['boardPlayPauseAction', { boardId: 9 }],
	['boardOnOffStateAction', { boardId: 9 }],
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 9 }],
	['boardLayerSoloStateAction', { boardId: 2, layerId: 1 }],
	['displayOnlineStateAction', { displayId: 9 }],
]

async function start(producerOptions) {
	const producer = await startFakeProducer({ snapshot: SNAPSHOT, ...producerOptions })
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }, (i) =>
		Object.assign(i.timing, { handshakeMs: 200 }),
	)
	await waitFor(() => instance.socket?.isConnected && instance.protocol !== Protocol.Pending)
	const cleanup = async () => {
		await instance.destroy()
		await producer.close()
	}
	return { producer, instance, recorded, cleanup }
}

// Runs actions that must send nothing, and checks that each one logs a warning.
async function expectNothingSent(producer, recorded, actions, messagePattern) {
	const count = producer.lines.length
	for (const [actionId, options] of actions) {
		const warnCount = recorded.logs.filter((log) => log.level === 'warn').length
		await runAction(recorded, actionId, options)
		const warnings = recorded.logs.filter((log) => log.level === 'warn')
		assert.equal(warnings.length, warnCount + 1, actionId)
		assert.match(warnings.at(-1).message, messagePattern, actionId)
	}
	// TCP keeps the order: a wrong line would come before this one.
	await runAction(recorded, 'boardPreviousAction', { boardId: 3 })
	await producer.waitForLines(count + 1)
	assert.deepEqual(producer.lines.slice(count), ['boardPlayPrevious*3'])
}

test('toggles send the opposite of the current state', async () => {
	const { producer, recorded, cleanup } = await start()
	for (const [actionId, options, expected] of TOGGLES) {
		const count = producer.lines.length
		await runAction(recorded, actionId, { ...options, mode: 'toggle' })
		await producer.waitForLines(count + 1)
		assert.equal(producer.lines[count], expected, `${actionId} ${JSON.stringify(options)}`)
	}
	await cleanup()
})

test('every toggle action is tested', async () => {
	const { recorded, cleanup } = await start()
	const withMode = Object.entries(recorded.actionDefinitions)
		.filter(([, definition]) => definition.options.some((opt) => opt.id === 'mode'))
		.map(([id]) => id)
	const tested = new Set(TOGGLES.map(([id]) => id))
	for (const id of [...withMode, 'timelinePlayPauseAction', 'boardPlayPauseAction']) assert.ok(tested.has(id), id)
	await cleanup()
})

test('a toggle follows the state pushed by Producer', async () => {
	const { producer, instance, recorded, cleanup } = await start()
	producer.send('timelinestate*2*1*0*100*1*')
	await waitFor(() => instance.state.timelines.get(2).playing)
	const count = producer.lines.length
	await runAction(recorded, 'timelinePlayPauseAction', { timelineId: 2 })
	await runAction(recorded, 'timelineOnOffStateAction', { timelineId: 2, mode: 'toggle' })
	await producer.waitForLines(count + 2)
	assert.deepEqual(producer.lines.slice(count), ['locate*2', 'settimelineon*2*0'])
	await cleanup()
})

test('a toggle on an unknown object sends nothing', async () => {
	const { producer, recorded, cleanup } = await start()
	await expectNothingSent(
		producer,
		recorded,
		UNKNOWN.map(([id, options]) => [id, { ...options, mode: 'toggle' }]),
		/Producer did not send this state/,
	)
	await cleanup()
})

test('a toggle on an object without its state line sends nothing', async () => {
	const { producer, instance, recorded, cleanup } = await start({
		snapshot: ['timelinelayerstate*5*2*1*1*1', 'boardlayerstate*6*0*1*1'],
	})
	await waitFor(() => instance.state.boards.has(6))
	await expectNothingSent(
		producer,
		recorded,
		[
			['timelinePlayPauseAction', { timelineId: 5 }],
			['timelineOnOffStateAction', { timelineId: 5, mode: 'toggle' }],
			['timelineLayerOnOffStateAction', { timelineId: 5, layerType: 1, layerId: 1, mode: 'toggle' }],
			['boardPlayPauseAction', { boardId: 6 }],
			['displayOnlineStateAction', { displayId: 7, mode: 'toggle' }],
		],
		/Producer did not send this state/,
	)
	await cleanup()
})

test('a toggle without subscription sends nothing', async () => {
	const { producer, instance, recorded, cleanup } = await start({ subscribe: false })
	assert.equal(instance.protocol, Protocol.Legacy)
	await expectNothingSent(
		producer,
		recorded,
		TOGGLES.map(([id, options]) => [id, { ...options, mode: 'toggle' }]),
		/toggle needs the state of Producer/,
	)
	await cleanup()
})

test('on and off work without subscription', async () => {
	const { producer, instance, recorded, cleanup } = await start({ subscribe: false })
	assert.equal(instance.protocol, Protocol.Legacy)
	const count = producer.lines.length
	await runAction(recorded, 'timelineOnOffStateAction', { timelineId: 9, mode: 'on' })
	await runAction(recorded, 'boardLayerSoloStateAction', { boardId: 9, layerId: 1, mode: 'off' })
	await runAction(recorded, 'displayOnlineStateAction', { displayId: 9, mode: 'off' })
	await producer.waitForLines(count + 3)
	assert.deepEqual(producer.lines.slice(count), ['settimelineon*9*1', 'setBoardLayerSolo*9*0*0', 'offline*9'])
	await cleanup()
})

test('an invalid mode sends nothing', async () => {
	const { producer, recorded, cleanup } = await start()
	await expectNothingSent(
		producer,
		recorded,
		[
			['timelineOnOffStateAction', { timelineId: 1, mode: true }],
			['boardOnOffStateAction', { boardId: 1, mode: undefined }],
			['displayOnlineStateAction', { displayId: 1, mode: 'ON' }],
		],
		/invalid mode/,
	)
	await cleanup()
})
