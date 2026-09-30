import net from 'node:net'

// A TCP server that acts as Producer. It collects the received lines.
export async function startFakeProducer() {
	const lines = []
	const sockets = new Set()
	let waiters = []
	let pending = ''

	const notify = () => {
		waiters = waiters.filter((w) => {
			if (lines.length < w.count) return true
			w.resolve()
			return false
		})
	}

	const server = net.createServer((socket) => {
		sockets.add(socket)
		socket.on('close', () => sockets.delete(socket))
		socket.on('data', (data) => {
			pending += data.toString('latin1')
			const parts = pending.split('\n')
			pending = parts.pop()
			lines.push(...parts)
			notify()
		})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

	return {
		port: server.address().port,
		lines,
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
		async close() {
			for (const socket of sockets) socket.destroy()
			await new Promise((resolve) => server.close(resolve))
		},
	}
}

export async function waitFor(predicate, timeoutMs = 2000) {
	const start = Date.now()
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout')
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
}
