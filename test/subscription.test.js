import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InstanceStatus } from '@companion-module/base'
import { createModule, runAction } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'
import { ChangeKind, Protocol } from '../state.js'

const FAST_TIMING = {
	handshakeMs: 200,
	checkaliveMs: 50,
	aliveTimeoutMs: 300,
	clockMs: 10,
	definitionsMs: 20,
}

const TIMELINE_NAME = 'Intro * Scène 1 ✓'

// A snapshot like Producer sends for a default show, in the protocol order.
function showSnapshot() {
	const lines = ['showframerate*25']
	for (const id of [1, 2]) {
		lines.push(`timelinestate*${id}*1*${id * 1000}*100*0*${id === 1 ? TIMELINE_NAME : 'Timeline 2'}`)
		for (let layer = 1; layer <= 4; layer++) lines.push(`timelinelayerstate*${id}*0*${layer}*0*0`)
		for (let layer = 1; layer <= 40; layer++) lines.push(`timelinelayerstate*${id}*2*${layer}*0*0`)
	}
	lines.push('boardstate*1*1*2000*80*0*2*4*-1*10000*Main board')
	for (let column = 0; column < 50; column++) lines.push(`nameboardsequence*1*${column}*${column === 2 ? 'Seq*3' : ''}`)
	for (let layer = 0; layer < 10; layer++) lines.push(`boardlayerstate*1*${layer}*0*0`)
	lines.push('screenstate*1*3*Left')
	lines.push('screenstate*2*1*Right')
	return lines
}

async function startSubscribed(snapshot = showSnapshot(), producerOptions = {}, timing = {}) {
	const producer = await startFakeProducer({ snapshot, ...producerOptions })
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }, (i) =>
		Object.assign(i.timing, FAST_TIMING, timing),
	)
	await waitFor(() => instance.protocol === Protocol.Subscribed)
	await waitFor(() => Object.keys(recorded.variableDefinitions).length > 1 && !instance.definitionsTimer)
	const cleanup = async () => {
		await instance.destroy()
		await producer.close()
	}
	return { producer, instance, recorded, cleanup }
}

// Sends lines and waits until the module has processed them.
async function sendLines(producer, recorded, lines, check) {
	for (const line of lines) producer.send(line)
	await waitFor(check)
}

test('subscribes on connect and parses the snapshot', async () => {
	const { producer, instance, recorded, cleanup } = await startSubscribed()
	assert.equal(producer.controlLines[0], 'subscribe*1')
	assert.equal(recorded.statuses.at(-1).status, InstanceStatus.Ok)

	const v = recorded.variableValues
	assert.equal(v.show_fps, 25)
	assert.equal(v.tl_1_name, TIMELINE_NAME)
	assert.equal(v.tl_1_tc, '00:00:01:00')
	assert.equal(v.tl_1_tc_hms, '00:00:01')
	assert.equal(v.tl_1_tc_ms, 1000)
	assert.equal(v.tl_1_state, 'Pause')
	assert.equal(v.tl_1_on, 'ON')
	assert.equal(v.tl_1_gm, 100)
	assert.equal(v.tl_2_tc, '00:00:02:00')
	assert.equal(v.board_1_name, 'Main board')
	assert.equal(v.board_1_gm, 80)
	assert.equal(v.board_1_seq, 3)
	assert.equal(v.board_1_seq_name, 'Seq*3')
	assert.equal(v.board_1_next, 5)
	assert.equal(v.board_1_next_name, '')
	assert.equal(v.board_1_tc, '00:00:02:00')
	assert.equal(v.board_1_remaining, '00:00:09')
	assert.equal(v.board_1_remaining_ms, 8000)
	assert.equal(v.display_1_name, 'Left')
	assert.equal(v.display_1_status, 'Connected')
	assert.equal(v.display_2_status, 'Offline')

	// Every value has a definition, and the labels carry the names.
	for (const id of Object.keys(v)) assert.ok(id in recorded.variableDefinitions, id)
	assert.equal(recorded.variableDefinitions.tl_1_name.name, `Timeline 1 (${TIMELINE_NAME}): name`)

	// The layers are in the state, for the feedbacks.
	assert.equal(instance.state.timelines.get(1).layers.size, 44)
	assert.equal(instance.state.boards.get(1).layers.size, 10)
	assert.equal(instance.state.boards.get(1).sequenceNames.size, 50)

	// ~160 lines, but only a few batches of values.
	assert.ok(recorded.variableValueCalls.length < 10, String(recorded.variableValueCalls.length))
	await cleanup()
})

test('a change only sends the changed variables', async () => {
	const { producer, recorded, cleanup } = await startSubscribed()
	const before = recorded.variableValueCalls.length

	await sendLines(
		producer,
		recorded,
		['timelinestate*2*0*2000*50*0*Timeline 2'],
		() => recorded.variableValues.tl_2_gm === 50,
	)
	assert.deepEqual(recorded.variableValueCalls.slice(before), [{ tl_2_on: 'OFF', tl_2_gm: 50 }])

	await sendLines(
		producer,
		recorded,
		['boardstate*1*1*0*80*0*3*-1*-1*-1*Main board', 'screenstate*2*4*Right'],
		() => recorded.variableValues.display_2_status === 'Error',
	)
	const v = recorded.variableValues
	assert.equal(v.board_1_seq, 4)
	assert.equal(v.board_1_seq_name, '')
	assert.equal(v.board_1_next, '')
	assert.equal(v.board_1_next_name, '')
	// An infinite sequence has no remaining time.
	assert.equal(v.board_1_remaining, '')
	assert.equal(v.board_1_remaining_ms, '')

	// A rename changes the label of the definitions too.
	await sendLines(
		producer,
		recorded,
		['timelinestate*2*0*2000*50*0*Ending ** 終'],
		() => recorded.variableDefinitions.tl_2_name.name === 'Timeline 2 (Ending ** 終): name',
	)
	assert.equal(v.tl_2_name, 'Ending ** 終')
	await cleanup()
})

test('subscribed drops the old state', async () => {
	const { producer, recorded, cleanup } = await startSubscribed()
	await sendLines(
		producer,
		recorded,
		['subscribed*1', 'showframerate*50', 'timelinestate*2*1*20*100*0*Only'],
		() => !('tl_1_name' in recorded.variableDefinitions),
	)
	assert.deepEqual(Object.keys(recorded.variableDefinitions).sort(), [
		'show_fps',
		'tl_2_gm',
		'tl_2_name',
		'tl_2_on',
		'tl_2_state',
		'tl_2_tc',
		'tl_2_tc_hms',
		'tl_2_tc_ms',
	])
	assert.equal(recorded.variableValues.tl_2_tc, '00:00:00:01')
	await cleanup()
})

test('the variables go blank on disconnect', async () => {
	const { producer, instance, recorded, cleanup } = await startSubscribed()
	producer.subscribe = false
	const definitions = recorded.variableDefinitions

	producer.dropClients()
	await waitFor(() => recorded.variableValues.tl_1_tc === '--:--:--:--')
	const v = recorded.variableValues
	assert.equal(v.tl_1_tc_hms, '--:--:--')
	assert.equal(v.tl_1_tc_ms, '')
	assert.equal(v.tl_1_name, '')
	assert.equal(v.tl_1_state, '')
	assert.equal(v.board_1_tc, '--:--:--:--')
	assert.equal(v.board_1_seq, '')
	assert.equal(v.board_1_remaining, '')
	assert.equal(v.display_1_status, '')
	assert.equal(v.show_fps, '')
	assert.equal(instance.state.timelines.size, 0)
	assert.equal(instance.state.subscribed, false)

	// The definitions stay, so the buttons show blanks and not missing variables.
	await new Promise((resolve) => setTimeout(resolve, 3 * FAST_TIMING.definitionsMs))
	assert.equal(recorded.variableDefinitions, definitions)
	await cleanup()
})

test('the clocks run locally while playing', async () => {
	let now = 1000
	const { instance, recorded } = await createModule({ host: '' }, (i) => {
		Object.assign(i.timing, FAST_TIMING)
		i.now = () => now
	})
	const feed = (...lines) => instance.onData(Buffer.from(lines.map((l) => l + '\n').join(''), 'utf8'))

	feed('subscribed*1', 'showframerate*25', 'timelinestate*1*1*1000*100*1*', 'boardstate*1*1*0*100*1*0*-1*-1*5000*')
	await waitFor(() => 'tl_1_tc' in recorded.variableDefinitions)
	assert.ok(instance.clockTimer)
	assert.equal(recorded.variableValues.tl_1_tc, '00:00:01:00')
	assert.equal(recorded.variableValues.tl_1_state, 'Play')

	now += 1500
	await waitFor(() => recorded.variableValues.tl_1_tc === '00:00:02:12')
	assert.equal(recorded.variableValues.tl_1_tc_ms, 2500)
	assert.equal(recorded.variableValues.board_1_tc_ms, 1500)
	assert.equal(recorded.variableValues.board_1_remaining, '00:00:04')
	assert.equal(recorded.variableValues.board_1_remaining_ms, 3500)

	// A resent line (jump) restarts the interpolation from its tc.
	feed('timelinestate*1*1*60000*100*1*')
	now += 40
	await waitFor(() => recorded.variableValues.tl_1_tc === '00:01:00:01')
	// Past the end of the sequence: 0 ms, and 00:00:01 like the countdown of Producer.
	now += 10000
	await waitFor(() => recorded.variableValues.board_1_remaining_ms === 0)
	assert.equal(recorded.variableValues.board_1_remaining, '00:00:01')

	// Paused: the tc is the one of the line, and the timer stops.
	feed('timelinestate*1*1*5000*100*0*', 'boardstate*1*1*1234*100*0*0*-1*-1*5000*')
	assert.equal(recorded.variableValues.tl_1_tc, '00:00:05:00')
	assert.equal(recorded.variableValues.tl_1_state, 'Pause')
	assert.equal(instance.clockTimer, undefined)
	now += 1000
	instance.updateVariables()
	assert.equal(recorded.variableValues.tl_1_tc, '00:00:05:00')

	// 29.97 is shown as 29 fps, with no drop frame
	feed('showframerate*29.97', 'timelinestate*1*1*60061*100*0*')
	assert.equal(recorded.variableValues.tl_1_tc, '00:01:00:01')
	assert.equal(recorded.variableValues.show_fps, 29.97)

	feed('timelinestate*1*1*0*100*1*')
	assert.ok(instance.clockTimer)
	await instance.destroy()
	assert.equal(instance.clockTimer, undefined)
})

test('the values are sent only when the text changes', async () => {
	let now = 0
	const { instance, recorded } = await createModule({ host: '' }, (i) => {
		Object.assign(i.timing, FAST_TIMING)
		i.now = () => now
	})
	instance.onData(Buffer.from('subscribed*1\nshowframerate*25\ntimelinestate*1*1*0*100*1*\n'))
	await waitFor(() => 'tl_1_tc' in recorded.variableDefinitions)
	const before = recorded.variableValueCalls.length
	instance.updateVariables()
	instance.updateVariables()
	assert.equal(recorded.variableValueCalls.length, before)
	now += 10
	instance.updateVariables()
	// Same frame: only the ms changes.
	assert.deepEqual(recorded.variableValueCalls.slice(before), [{ tl_1_tc_ms: 10 }])
	await instance.destroy()
})

test('state changes are reported by kind, for the feedbacks', async () => {
	const { instance } = await createModule({ host: '' })
	const reported = []
	instance.stateChanged = (changes) => reported.push([...changes].sort())
	instance.onData(Buffer.from('subscribed*1\ntimelinelayerstate*1*2*3*1*0\nscreenstate*4*3*\n'))
	assert.deepEqual(reported.at(-1), [
		ChangeKind.Board,
		ChangeKind.BoardLayer,
		ChangeKind.BoardSequence,
		ChangeKind.Connection,
		ChangeKind.Fps,
		ChangeKind.Screen,
		ChangeKind.Structure,
		ChangeKind.Timeline,
		ChangeKind.TimelineLayer,
	])
	instance.onData(Buffer.from('timelinelayerstate*1*2*3*0*0\n'))
	assert.deepEqual(reported.at(-1), [ChangeKind.TimelineLayer])
	assert.equal(instance.state.timelines.get(1).layers.get('2*3').blind, false)
	// Nothing changes: no report
	const count = reported.length
	instance.onData(Buffer.from('alive\n'))
	assert.equal(reported.length, count)
	await instance.destroy()
})

test('an empty sequence shows 00:00:00, like Producer', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	instance.onData(Buffer.from('subscribed*1\nshowframerate*25\nboardstate*1*1*0*100*1*0*-1*-1*0*\n'))
	await waitFor(() => 'board_1_remaining' in recorded.variableDefinitions)
	assert.equal(recorded.variableValues.board_1_remaining, '00:00:00')
	assert.equal(recorded.variableValues.board_1_remaining_ms, 0)
	await instance.destroy()
})

test('state lines outside a subscription are ignored', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	instance.onData(Buffer.from('showframerate*25\ntimelinestate*1*1*0*100*0*A\n'))
	assert.equal(instance.state.timelines.size, 0)
	assert.equal(instance.state.fps, undefined)
	assert.equal(recorded.logs.filter((log) => /Unhandled message/.test(log.message)).length, 2)
	await instance.destroy()
})

test('a re-subscribe to an empty show removes the variables', async () => {
	const { producer, recorded, cleanup } = await startSubscribed()
	producer.send('subscribed*1')
	await waitFor(() => Object.keys(recorded.variableDefinitions).length === 1)
	assert.deepEqual(Object.keys(recorded.variableDefinitions), ['show_fps'])
	await cleanup()
})

test('subscribed with another version is not supported', async () => {
	for (const line of ['subscribed', 'subscribed*0', 'subscribed*x', 'subscribed*1.5', 'subscribed*2']) {
		const { instance } = await createModule({ host: '' })
		instance.onData(Buffer.from(`${line}\ntimelinestate*1*1*0*100*0*A\n`))
		assert.equal(instance.protocol, Protocol.Legacy, line)
		assert.equal(instance.state.subscribed, false, line)
		assert.equal(instance.state.timelines.size, 0, line)
		await instance.destroy()
	}
})

test('malformed state lines are ignored', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	instance.onData(
		Buffer.from(
			'subscribed*1\ntimelinestate*x*1*0*100*0*A\ntimelinestate*1*1*0*100\nboardstate*2*1*abc*0*0*0*-1*-1*-1*B\n' +
				'timelinestate*3*1*0*100*0\ntimelinestate*1.0*1*0*100*0*A\ntimelinestate*1e0*1*0*100*0*A\n' +
				'timelinestate* 4*1*0*100*0*A\nscreenstate*5*0x3*C\n',
		),
	)
	assert.equal(instance.state.timelines.size, 0)
	assert.equal(instance.state.boards.size, 0)
	assert.equal(instance.state.screens.size, 0)
	assert.ok(!recorded.logs.some((log) => log.level === 'error'))
	await instance.destroy()
})

test('heartbeat: checkalive every period, no reconnection while Producer replies', async () => {
	// The timeout is 20 checkalive periods: a slow test machine does not reconnect.
	const { producer, instance, recorded, cleanup } = await startSubscribed(showSnapshot(), {}, { aliveTimeoutMs: 1000 })
	await waitFor(() => producer.controlLines.filter((l) => l === 'checkalive').length >= 3)
	await new Promise((resolve) => setTimeout(resolve, 1500))
	assert.equal(producer.connectionCount, 1)
	assert.equal(instance.noReply, false)
	assert.equal(recorded.statuses.at(-1).status, InstanceStatus.Ok)
	await cleanup()
})

test('heartbeat: no reply means a lost connection', async () => {
	const { producer, instance, recorded, cleanup } = await startSubscribed(showSnapshot(), { alive: false })
	// Producer freezes: no reply to anything.
	producer.subscribe = false
	await waitFor(() => producer.connectionCount >= 2, 3000)
	assert.equal(instance.noReply, true)
	assert.equal(recorded.variableValues.tl_1_tc, '--:--:--:--')
	assert.equal(instance.state.timelines.size, 0)
	await waitFor(() => recorded.statuses.at(-1).status === InstanceStatus.UnknownWarning)
	assert.match(recorded.statuses.at(-1).message, /No reply/)
	// It keeps reconnecting, but logs once.
	await waitFor(() => producer.connectionCount >= 3, 3000)
	assert.equal(recorded.logs.filter((log) => /No reply from Producer/.test(log.message)).length, 1)
	assert.equal(recorded.logs.filter((log) => /^Connected to Producer/.test(log.message)).length, 1)

	// Producer answers again, on a new connection: the warning goes away.
	producer.alive = true
	producer.subscribe = true
	const reported = []
	instance.stateChanged = (changes) => reported.push({ noReply: instance.noReply, changes })
	producer.dropClients()
	await waitFor(() => instance.noReply === false && instance.protocol === Protocol.Subscribed, 4000)
	assert.ok(reported.some((r) => r.noReply === false && r.changes.has(ChangeKind.Connection)))
	await waitFor(() => recorded.statuses.at(-1).status === InstanceStatus.Ok)
	await waitFor(() => recorded.variableValues.tl_1_name === TIMELINE_NAME)
	await cleanup()
})

test('an old Producer: warning, and the actions still work', async () => {
	const producer = await startFakeProducer({ subscribe: false })
	const reported = []
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }, (i) => {
		// Large margins: the test checks what happens before the handshake timeout.
		Object.assign(i.timing, FAST_TIMING, { handshakeMs: 1000, aliveTimeoutMs: 1000 })
		i.stateChanged = (changes) => reported.push({ protocol: i.protocol, changes })
	})
	await waitFor(() => instance.socket?.isConnected)
	// While waiting for the reply, tc= does not warn.
	await runAction(recorded, 'timelineLocateAction', { timelineId: 1, timecode: '00:00:10:00' })
	await producer.waitForLines(1)
	assert.ok(!recorded.logs.some((log) => /did not reply/.test(log.message)))

	await waitFor(() => instance.protocol === Protocol.Legacy)
	// The feedbacks hear about it.
	assert.ok(reported.at(-1).changes.has(ChangeKind.Connection))
	assert.equal(reported.at(-1).protocol, Protocol.Legacy)
	assert.equal(recorded.statuses.at(-1).status, InstanceStatus.UnknownWarning)
	assert.match(recorded.statuses.at(-1).message, /does not match/)
	assert.equal(recorded.logs.filter((log) => /did not reply to subscribe/.test(log.message)).length, 1)

	await runAction(recorded, 'timelinePlayAction', { timelineId: 3 })
	await runAction(recorded, 'timelineLocateAndPlayAction', { timelineId: 3, timecode: '00:01:30:12' })
	await producer.waitForLines(3)
	assert.deepEqual(producer.lines.slice(1), ['play*3', 'play*3*tc=00:01:30:12'])
	const warning = recorded.logs.at(-1)
	assert.equal(warning.level, 'warn')
	assert.match(warning.message, /^Timeline locate and play: Producer did not reply to subscribe/)

	// The heartbeat keeps the connection: old Producers reply to checkalive.
	await new Promise((resolve) => setTimeout(resolve, 1500))
	assert.equal(producer.connectionCount, 1)
	// Only the show_fps variable exists.
	assert.deepEqual(Object.keys(recorded.variableDefinitions), ['show_fps'])

	await instance.destroy()
	await producer.close()
})

test('a recent Producer: no tc= warning', async () => {
	const { producer, recorded, cleanup } = await startSubscribed()
	const count = producer.lines.length
	await runAction(recorded, 'timelineLocateAction', { timelineId: 1, timecode: '00:00:10:00' })
	await producer.waitForLines(count + 1)
	assert.ok(!recorded.logs.some((log) => log.level === 'warn'))
	await cleanup()
})

test('destroy stops all the timers', async () => {
	const { instance, cleanup } = await startSubscribed(['showframerate*25', 'timelinestate*1*1*0*100*1*A'])
	await waitFor(() => instance.clockTimer !== undefined)
	await cleanup()
	assert.equal(instance.clockTimer, undefined)
	assert.equal(instance.heartbeatTimer, undefined)
	assert.equal(instance.handshakeTimer, undefined)
	assert.equal(instance.definitionsTimer, undefined)
})
