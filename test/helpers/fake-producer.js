import net from 'node:net'

// The lines of the connection protocol. They go to `controlLines`, not `lines`,
// so that the action tests only see the commands.
const CONTROL_LINES = /^(subscribe(\*.*)?|unsubscribe|checkalive)$/

// A TCP server that acts as Producer. It collects the received lines.
// Options:
// - subscribe: reply `subscribed*1` and the snapshot to `subscribe` (a recent Producer)
// - alive: reply `alive` to `checkalive`
// - snapshot: the lines sent after `subscribed*1`
export async function startFakeProducer({ subscribe = true, alive = true, snapshot = [] } = {}) {
	const lines = []
	const controlLines = []
	const sockets = new Set()
	let connectionCount = 0
	let waiters = []

	const notify = () => {
		waiters = waiters.filter((w) => {
			if (lines.length < w.count) return true
			w.resolve()
			return false
		})
	}

	const producer = {
		// Can be changed during a test.
		subscribe,
		alive,
		snapshot,
		port: undefined,
		lines,
		controlLines,
		// Resolves once `count` lines have been received in total.
		waitForLines(count, timeoutMs = 2000) {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`Timeout: got ${lines.length}/${count} lines`)), timeoutMs)
				waiters.push({ count, resolve: () => (clearTimeout(timer), resolve()) })
				notify()
			})
		},
		send(line) {
			for (const socket of sockets) socket.write(line + '\n')
		},
		// Writes the data as is, to test partial lines.
		sendRaw(data) {
			for (const socket of sockets) socket.write(data)
		},
		get clientCount() {
			return sockets.size
		},
		get connectionCount() {
			return connectionCount
		},
		// Closes the client connections, but keeps listening.
		dropClients() {
			for (const socket of sockets) socket.destroy()
		},
		async close() {
			for (const socket of sockets) socket.destroy()
			await new Promise((resolve) => server.close(resolve))
		},
	}

	const onLine = (socket, line) => {
		if (!CONTROL_LINES.test(line)) {
			lines.push(line)
			notify()
			return
		}
		controlLines.push(line)
		if (line.startsWith('subscribe') && producer.subscribe) {
			socket.write(['subscribed*1', ...producer.snapshot].map((l) => l + '\n').join(''))
		} else if (line === 'checkalive' && producer.alive) {
			socket.write('alive\n')
		}
	}

	const server = net.createServer((socket) => {
		sockets.add(socket)
		connectionCount++
		let pending = ''
		socket.on('close', () => sockets.delete(socket))
		socket.on('error', () => {})
		socket.on('data', (data) => {
			pending += data.toString('latin1')
			const parts = pending.split('\n')
			pending = parts.pop()
			for (const line of parts) onLine(socket, line)
		})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

	producer.port = server.address().port
	return producer
}

export async function waitFor(predicate, timeoutMs = 2000) {
	const start = Date.now()
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout')
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
}
