import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { InstanceStatus } from '@companion-module/base'
import { createModule, runAction } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'

// Returns a local port with nothing listening on it.
async function freePort() {
	const server = net.createServer()
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const { port } = server.address()
	await new Promise((resolve) => server.close(resolve))
	return port
}

const lastStatus = (recorded) => recorded.statuses.at(-1)?.status

test('config has port 3055 by default', async () => {
	const { instance } = await createModule({ host: '' })
	const port = instance.getConfigFields().find((field) => field.id === 'port')
	assert.equal(port.default, '3055')
	await instance.destroy()
})

test('no host gives a bad config status', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	assert.deepEqual(
		recorded.statuses.map((s) => s.status),
		[InstanceStatus.BadConfig],
	)
	assert.equal(instance.socket, undefined)
	await instance.destroy()
})

test('status follows the connection', async () => {
	const producer = await startFakeProducer()
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) })

	// init() must not claim Ok before the socket is connected.
	assert.equal(recorded.statuses[0].status, InstanceStatus.Connecting)
	await waitFor(() => lastStatus(recorded) === InstanceStatus.Ok)
	assert.ok(instance.socket.isConnected)

	await producer.close()
	await waitFor(() => lastStatus(recorded) !== InstanceStatus.Ok)
	assert.ok(
		[InstanceStatus.Disconnected, InstanceStatus.UnknownError, InstanceStatus.Connecting].includes(
			lastStatus(recorded),
		),
		lastStatus(recorded),
	)
	assert.ok(!instance.socket.isConnected)

	await instance.destroy()
})

test('status reports a refused connection', async () => {
	const port = await freePort()
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(port) })

	await waitFor(() => lastStatus(recorded) === InstanceStatus.UnknownError)
	assert.ok(!recorded.statuses.some((s) => s.status === InstanceStatus.Ok))
	assert.equal(recorded.logs.filter((log) => log.level === 'error').length, 1)

	await instance.destroy()
})

test('commands are dropped with a warning when not connected', async () => {
	const port = await freePort()
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(port) })

	await runAction(recorded, 'timelinePlayAction', { timelineId: 4 })
	const warnings = recorded.logs.filter((log) => log.level === 'warn')
	assert.equal(warnings.length, 1)
	assert.match(warnings[0].message, /dropped.*play\*4$/)

	await instance.destroy()
})

test('received data is split in lines', async () => {
	const producer = await startFakeProducer()
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) })
	await waitFor(() => instance.socket?.isConnected && producer.clientCount === 1)

	const handled = []
	instance.handleLine = (line) => handled.push(line)

	producer.sendRaw('alive\r\nstatetime')
	await waitFor(() => handled.length === 1)
	producer.sendRaw('line*1\n\nnametimeline*1*')
	await waitFor(() => handled.length === 2)
	// A UTF-8 character split over two packets.
	const name = Buffer.from('Scène\n', 'utf8')
	assert.deepEqual([...name.subarray(2, 4)], [0xc3, 0xa8])
	producer.sendRaw(name.subarray(0, 3))
	await new Promise((resolve) => setTimeout(resolve, 50))
	producer.sendRaw(name.subarray(3))
	await waitFor(() => handled.length === 3)

	assert.deepEqual(handled, ['alive', 'statetimeline*1', 'nametimeline*1*Scène'])

	await instance.destroy()
	await producer.close()
})

test('an oversized line is dropped up to its end', async () => {
	const { instance, recorded } = await createModule({ host: '' })
	const handled = []
	instance.handleLine = (line) => handled.push(line)

	instance.onData(Buffer.from('before\n'))
	instance.onData(Buffer.alloc(1024 * 1024 + 1, 'x'))
	instance.onData(Buffer.alloc(1024 * 1024 + 1, 'y'))
	instance.onData(Buffer.from('tail of the big line\nafter\n'))

	assert.deepEqual(handled, ['before', 'after'])
	assert.equal(recorded.logs.filter((log) => log.level === 'warn').length, 1)
	await instance.destroy()
})

test('unknown lines are logged at debug level', async () => {
	const producer = await startFakeProducer()
	const { instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) })
	await waitFor(() => instance.socket?.isConnected && producer.clientCount === 1)

	producer.send('something*1')
	await waitFor(() => recorded.logs.some((log) => log.message.includes('something*1')))
	const log = recorded.logs.find((log) => log.message.includes('something*1'))
	assert.equal(log.level, 'debug')

	await instance.destroy()
	await producer.close()
})
