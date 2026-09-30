import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createModule } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'
import { ChangeKind, Protocol } from '../state.js'
import { FeedbackId, FEEDBACKS_BY_CHANGE, feedbacksForChanges } from '../feedbacks.js'

// Timeline 1 plays, timeline 2 is paused and OFF. Board 1 plays sequence 3, sequence 5 is enqueued.
const SNAPSHOT = [
	'showframerate*25',
	'nametimeline*1*A',
	'statetimeline*1*1*1000*100*1',
	'statetimelinelayer*1*0*1*0*0',
	'statetimelinelayer*1*2*1*1*0',
	'statetimelinelayer*1*2*2*0*1',
	'nametimeline*2*B',
	'statetimeline*2*0*0*100*0',
	'nameboard*1*Main',
	'stateboard*1*1*0*100*1*2*4*10000',
	'stateboardlayer*1*0*1*0',
	'stateboardlayer*1*1*0*1',
	'nameboard*2*Other',
	'stateboard*2*0*0*100*0*-1*-1*-1',
	'namescreen*1*Left',
	'screenstatus*1*3',
	'namescreen*2*Right',
	'screenstatus*2*1',
	'namescreen*3*Back',
	'screenstatus*3*4',
]

async function subscribedModule(lines = SNAPSHOT) {
	const { instance, recorded } = await createModule({ host: '' })
	instance.onData(Buffer.from(['subscribed*1', ...lines].map((l) => l + '\n').join('')))
	return { instance, recorded }
}

function check(recorded, feedbackId, options) {
	const definition = recorded.feedbackDefinitions[feedbackId]
	if (!definition) throw new Error(`Unknown feedback ${feedbackId}`)
	const defaults = Object.fromEntries(definition.options.map((opt) => [opt.id, opt.default]))
	return definition.callback(
		{ type: 'boolean', id: 'f1', controlId: 'c1', feedbackId, options: { ...defaults, ...options } },
		{},
	)
}

// [feedbackId, options, expected with SNAPSHOT]
const CASES = [
	[FeedbackId.TimelinePlaying, { timelineId: 1 }, true],
	[FeedbackId.TimelinePlaying, { timelineId: 2 }, false],
	[FeedbackId.TimelinePlaying, { timelineId: 9 }, false],
	[FeedbackId.TimelinePaused, { timelineId: 2 }, true],
	[FeedbackId.TimelinePaused, { timelineId: 1 }, false],
	[FeedbackId.TimelinePaused, { timelineId: 9 }, false],
	[FeedbackId.TimelineOn, { timelineId: 1 }, true],
	[FeedbackId.TimelineOn, { timelineId: 2 }, false],
	[FeedbackId.TimelineLayerBlind, { timelineId: 1, layerType: 1, layerId: 1 }, true],
	[FeedbackId.TimelineLayerBlind, { timelineId: 1, layerType: 0, layerId: 1 }, false],
	[FeedbackId.TimelineLayerBlind, { timelineId: 1, layerType: 1, layerId: 2 }, false],
	[FeedbackId.TimelineLayerBlind, { timelineId: 1, layerType: 1, layerId: 9 }, false],
	[FeedbackId.TimelineLayerSolo, { timelineId: 1, layerType: 1, layerId: 2 }, true],
	[FeedbackId.TimelineLayerSolo, { timelineId: 1, layerType: 1, layerId: 1 }, false],
	[FeedbackId.TimelineLayerSolo, { timelineId: 2, layerType: 1, layerId: 2 }, false],
	[FeedbackId.BoardPlaying, { boardId: 1 }, true],
	[FeedbackId.BoardPlaying, { boardId: 2 }, false],
	[FeedbackId.BoardPaused, { boardId: 2 }, true],
	[FeedbackId.BoardPaused, { boardId: 1 }, false],
	[FeedbackId.BoardPaused, { boardId: 9 }, false],
	[FeedbackId.BoardOn, { boardId: 1 }, true],
	[FeedbackId.BoardOn, { boardId: 2 }, false],
	[FeedbackId.BoardCurrentSequence, { boardId: 1, sequenceId: 3 }, true],
	[FeedbackId.BoardCurrentSequence, { boardId: 1, sequenceId: 2 }, false],
	[FeedbackId.BoardCurrentSequence, { boardId: 2, sequenceId: 1 }, false],
	// No current column is -1: sequence 0 does not match it.
	[FeedbackId.BoardCurrentSequence, { boardId: 2, sequenceId: 0 }, false],
	[FeedbackId.BoardEnqueuedSequence, { boardId: 1, sequenceId: 5 }, true],
	[FeedbackId.BoardEnqueuedSequence, { boardId: 1, sequenceId: 3 }, false],
	[FeedbackId.BoardEnqueuedSequence, { boardId: 2, sequenceId: 0 }, false],
	[FeedbackId.BoardLayerBlind, { boardId: 1, layerId: 1 }, true],
	[FeedbackId.BoardLayerBlind, { boardId: 1, layerId: 2 }, false],
	[FeedbackId.BoardLayerBlind, { boardId: 1, layerId: 9 }, false],
	[FeedbackId.BoardLayerSolo, { boardId: 1, layerId: 2 }, true],
	[FeedbackId.BoardLayerSolo, { boardId: 1, layerId: 1 }, false],
	[FeedbackId.DisplayStatus, { displayId: 1, status: 3 }, true],
	[FeedbackId.DisplayStatus, { displayId: 1, status: 1 }, false],
	[FeedbackId.DisplayStatus, { displayId: 2, status: 1 }, true],
	[FeedbackId.DisplayStatus, { displayId: 2, status: 3 }, false],
	[FeedbackId.DisplayStatus, { displayId: 3, status: 4 }, true],
	[FeedbackId.DisplayStatus, { displayId: 9, status: 0 }, false],
]

test('every feedback is a boolean feedback with a default style', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	assert.deepEqual(Object.keys(recorded.feedbackDefinitions).sort(), Object.values(FeedbackId).sort())
	for (const [id, definition] of Object.entries(recorded.feedbackDefinitions)) {
		assert.equal(definition.type, 'boolean', id)
		assert.ok(Object.keys(definition.defaultStyle).length > 0, id)
		for (const option of definition.options) {
			if (option.type === 'number') assert.equal(option.asInteger, true, `${id} / ${option.id}`)
		}
	}
	await instance.destroy()
})

test('every state feedback is tested', () => {
	const tested = new Set(CASES.map(([id]) => id))
	const expected = Object.values(FeedbackId).filter((id) => id !== FeedbackId.ProducerConnected)
	assert.deepEqual([...tested].sort(), expected.sort())
	for (const id of tested) {
		assert.ok(
			CASES.some(([i, , e]) => i === id && e === true),
			`${id} true`,
		)
		assert.ok(
			CASES.some(([i, , e]) => i === id && e === false),
			`${id} false`,
		)
	}
})

test('feedbacks read the subscription state', async () => {
	const { instance, recorded } = await subscribedModule()
	for (const [id, options, expected] of CASES) {
		assert.equal(check(recorded, id, options), expected, `${id} ${JSON.stringify(options)}`)
	}
	await instance.destroy()
})

test('feedbacks follow the state changes', async () => {
	const { instance, recorded } = await subscribedModule()
	instance.onData(
		Buffer.from(
			[
				'statetimeline*1*0*1000*100*0',
				'statetimelinelayer*1*2*1*0*1',
				'stateboard*1*1*0*100*0*4*-1*-1',
				'stateboardlayer*1*0*0*1',
				'screenstatus*1*4',
			].join('\n') + '\n',
		),
	)
	assert.equal(check(recorded, FeedbackId.TimelinePlaying, { timelineId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.TimelinePaused, { timelineId: 1 }), true)
	assert.equal(check(recorded, FeedbackId.TimelineOn, { timelineId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.TimelineLayerBlind, { timelineId: 1, layerType: 1, layerId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.TimelineLayerSolo, { timelineId: 1, layerType: 1, layerId: 1 }), true)
	assert.equal(check(recorded, FeedbackId.BoardPaused, { boardId: 1 }), true)
	assert.equal(check(recorded, FeedbackId.BoardCurrentSequence, { boardId: 1, sequenceId: 5 }), true)
	assert.equal(check(recorded, FeedbackId.BoardEnqueuedSequence, { boardId: 1, sequenceId: 5 }), false)
	assert.equal(check(recorded, FeedbackId.BoardLayerBlind, { boardId: 1, layerId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.BoardLayerSolo, { boardId: 1, layerId: 1 }), true)
	assert.equal(check(recorded, FeedbackId.DisplayStatus, { displayId: 1, status: 4 }), true)

	// A removed object is false.
	instance.onData(Buffer.from('timelineremoved*1\nboardremoved*1\nscreenremoved*1\n'))
	assert.equal(check(recorded, FeedbackId.TimelinePaused, { timelineId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.TimelineLayerSolo, { timelineId: 1, layerType: 1, layerId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.BoardPaused, { boardId: 1 }), false)
	assert.equal(check(recorded, FeedbackId.DisplayStatus, { displayId: 1, status: 4 }), false)
	await instance.destroy()
})

const PLACEHOLDERS = [
	'nametimeline*5*X',
	'statetimelinelayer*5*2*1*1*1',
	'nameboard*6*Y',
	'stateboardlayer*6*0*1*1',
	'namescreen*7*Z',
]

const PLACEHOLDER_CASES = [
	[FeedbackId.TimelinePaused, { timelineId: 5 }],
	[FeedbackId.TimelineLayerBlind, { timelineId: 5, layerType: 1, layerId: 1 }],
	[FeedbackId.TimelineLayerSolo, { timelineId: 5, layerType: 1, layerId: 1 }],
	[FeedbackId.BoardPaused, { boardId: 6 }],
	[FeedbackId.BoardLayerBlind, { boardId: 6, layerId: 1 }],
	[FeedbackId.BoardLayerSolo, { boardId: 6, layerId: 1 }],
	[FeedbackId.DisplayStatus, { displayId: 7, status: 0 }],
]

test('objects without their state line are false', async () => {
	// A packet can end between the name line and the state line.
	const { instance, recorded } = await subscribedModule(PLACEHOLDERS)
	for (const [id, options] of PLACEHOLDER_CASES) assert.equal(check(recorded, id, options), false, id)

	instance.onData(
		Buffer.from(['statetimeline*5*0*0*100*0', 'stateboard*6*0*0*100*0*-1*-1*-1', 'screenstatus*7*0', ''].join('\n')),
	)
	for (const [id, options] of PLACEHOLDER_CASES) assert.equal(check(recorded, id, options), true, id)
	await instance.destroy()
})

test('feedbacks are false without a subscription', async () => {
	// Never subscribed: the state lines are ignored.
	const { instance, recorded } = await createModule({ host: '' })
	instance.onData(Buffer.from(SNAPSHOT.join('\n') + '\n'))
	for (const [id, options] of CASES) assert.equal(check(recorded, id, options), false, id)
	assert.equal(check(recorded, FeedbackId.ProducerConnected, {}), false)
	await instance.destroy()

	// Subscribed, then disconnected.
	const other = await subscribedModule()
	other.instance.onDisconnected()
	for (const [id, options] of CASES) assert.equal(check(other.recorded, id, options), false, id)
	await other.instance.destroy()

	// An old Producer: the state lines are ignored too.
	const legacy = await createModule({ host: '' })
	legacy.instance.onData(Buffer.from(['subscribed*0', ...SNAPSHOT].join('\n') + '\n'))
	assert.equal(legacy.instance.protocol, Protocol.Legacy)
	for (const [id, options] of CASES) assert.equal(check(legacy.recorded, id, options), false, id)
	await legacy.instance.destroy()
})

test('a disconnection checks all the feedbacks again', async () => {
	const { instance, recorded } = await subscribedModule()
	recorded.checkedFeedbacks.length = 0
	instance.onDisconnected()
	assert.deepEqual([...new Set(recorded.checkedFeedbacks)].sort(), Object.values(FeedbackId).sort())
	await instance.destroy()
})

test('each change kind checks only its feedbacks', async () => {
	const { instance, recorded } = await subscribedModule()
	const cases = [
		['statetimeline*1*1*1000*100*0', FEEDBACKS_BY_CHANGE[ChangeKind.Timeline]],
		['statetimelinelayer*1*2*1*0*0', FEEDBACKS_BY_CHANGE[ChangeKind.TimelineLayer]],
		['stateboard*1*1*0*100*1*3*4*10000', FEEDBACKS_BY_CHANGE[ChangeKind.Board]],
		['stateboardlayer*1*0*0*0', FEEDBACKS_BY_CHANGE[ChangeKind.BoardLayer]],
		['screenstatus*1*1', [FeedbackId.DisplayStatus]],
		['showframerate*50', []],
		['nameboardsequence*1*0*Intro', []],
	]
	for (const [line, expected] of cases) {
		recorded.checkedFeedbacks.length = 0
		instance.onData(Buffer.from(line + '\n'))
		assert.deepEqual([...recorded.checkedFeedbacks].sort(), [...expected].sort(), line)
	}
	await instance.destroy()
})

test('the change map covers every kind and every feedback', () => {
	for (const kind of Object.values(ChangeKind)) assert.ok(Array.isArray(FEEDBACKS_BY_CHANGE[kind]), kind)
	const mapped = new Set(Object.values(FEEDBACKS_BY_CHANGE).flat())
	assert.deepEqual([...mapped].sort(), Object.values(FeedbackId).sort())
	assert.deepEqual(feedbacksForChanges(new Set()), [])
	assert.deepEqual(
		feedbacksForChanges(new Set([ChangeKind.Timeline, ChangeKind.Screen, ChangeKind.Structure])).sort(),
		[FeedbackId.TimelinePlaying, FeedbackId.TimelinePaused, FeedbackId.TimelineOn, FeedbackId.DisplayStatus].sort(),
	)
})

test('producer connection feedback follows the connection', async () => {
	const producer = await startFakeProducer({ snapshot: SNAPSHOT })
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }, (i) =>
		Object.assign(i.timing, { handshakeMs: 200, checkaliveMs: 50, aliveTimeoutMs: 300 }),
	)
	const alive = () => check(recorded, FeedbackId.ProducerConnected, {})
	try {
		await waitFor(() => instance.protocol === Protocol.Subscribed)
		assert.equal(alive(), true)
		assert.ok(recorded.checkedFeedbacks.includes(FeedbackId.ProducerConnected))

		// No reply to checkalive: false until Producer replies again.
		producer.alive = false
		await waitFor(() => instance.noReply)
		assert.equal(alive(), false)
		producer.alive = true
		await waitFor(() => instance.protocol === Protocol.Subscribed && !instance.noReply, 5000)
		assert.equal(alive(), true)

		// An old Producer is alive too. TCPHelper reconnects after 2 s.
		producer.subscribe = false
		producer.dropClients()
		await waitFor(() => instance.protocol === Protocol.Legacy, 5000)
		assert.equal(alive(), true)

		producer.dropClients()
		await waitFor(() => instance.protocol === Protocol.None)
		assert.equal(alive(), false)
	} finally {
		await instance.destroy()
		await producer.close()
	}
})
