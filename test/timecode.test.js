import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { msToHmsf, hmsfToMs, formatTimecode, formatTimecodeHms, formatCountdown } from '../timecode.js'

const hmsf = (hour, minute, second, frame) => ({ hour, minute, second, frame })

// fixtures/ms_to_hmsf_cpp.txt was printed by a small program linked with the real
// Onlyview timecode_helpers.cpp. The framerate is the one of TimecodeWidget: the
// float show framerate cast to long, 0 becomes 25.
// - "TC <fps> <ms> <h> <m> <s> <f>": Ms_to_HMSF
// - "CD <fps> <ms> <h> <m> <s>": countdown mode, Ms_to_HMSF of ms + 1000
// - "INV <fps> <h> <m> <s> <f> <ms>": HMSF_to_Ms, with the fps cast to int
// - "SUM <fps> <hash>": a hash of Ms_to_HMSF for every ms in [0, 1300000[
const fixture = fs
	.readFileSync(new URL('./fixtures/ms_to_hmsf_cpp.txt', import.meta.url), 'utf8')
	.trim()
	.split(/\r?\n/)
	.map((line) => line.split(' '))
const rows = (kind) => fixture.filter((f) => f[0] === kind).map((f) => f.slice(1))
const pad2 = (value) => String(value).padStart(2, '0')

test('msToHmsf matches the C++ Ms_to_HMSF of TimecodeWidget', () => {
	const tcRows = rows('TC')
	assert.ok(tcRows.length > 300)
	for (const row of tcRows) {
		const [fps, ms, h, m, s, f] = row.map(Number)
		assert.deepEqual(msToHmsf(fps, ms), hmsf(h, m, s, f), row.join(' '))
		assert.equal(formatTimecode(fps, ms), [h, m, s, f].map(pad2).join(':'))
	}
})

test('msToHmsf matches the C++ for every ms of the first 21 minutes', () => {
	const sums = rows('SUM')
	assert.equal(sums.length, 4)
	for (const [fpsText, expected] of sums) {
		const fps = Number(fpsText)
		let sum = 0
		for (let ms = 0; ms < 1300000; ms++) {
			const t = msToHmsf(fps, ms)
			sum = (sum * 31 + ((t.hour * 60 + t.minute) * 60 + t.second) * 1000 + t.frame) % 1000000007
		}
		assert.equal(sum, Number(expected), `fps ${fps}`)
	}
})

test('hmsfToMs matches the C++ HMSF_to_Ms', () => {
	const invRows = rows('INV')
	assert.ok(invRows.length > 50)
	for (const row of invRows) {
		const [fps, h, m, s, f, ms] = row.map(Number)
		assert.equal(hmsfToMs(fps, h, m, s, f), ms, row.join(' '))
	}
})

test('the countdown matches the C++ countdown mode', () => {
	for (const row of rows('CD')) {
		const [, ms, h, m, s] = row.map(Number)
		assert.equal(formatCountdown(ms), [h, m, s].map(pad2).join(':'), row.join(' '))
	}
})

// tests_show_delegate_common.cpp (tc= parsing), read in reverse
test('msToHmsf is the inverse of the tc= values of Producer', () => {
	const cases = [
		[25, 90480, hmsf(0, 1, 30, 12)],
		[25, 90000, hmsf(0, 1, 30, 0)],
		[25, 12000, hmsf(0, 0, 12, 0)],
		[25, 960, hmsf(0, 0, 0, 24)],
		[25, 359999960, hmsf(99, 59, 59, 24)],
		[30, 1500, hmsf(0, 0, 1, 15)],
		[30, 3600034, hmsf(1, 0, 0, 1)],
	]
	for (const [fps, ms, expected] of cases) {
		assert.deepEqual(msToHmsf(fps, ms), expected, `${fps} ${ms}`)
		assert.equal(hmsfToMs(fps, expected.hour, expected.minute, expected.second, expected.frame), ms)
	}
})

// Each frame displayed by the module is located at the same frame by tc=.
test('every frame goes back and forth with tc=', () => {
	for (const fps of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]) {
		const frequency = Math.trunc(fps)
		for (let second = 0; second < 1320; second++) {
			for (let frame = 0; frame < frequency; frame++) {
				const m = Math.floor(second / 60)
				const s = second % 60
				const ms = hmsfToMs(fps, 0, m, s, frame)
				assert.deepEqual(msToHmsf(fps, ms), hmsf(0, m, s, frame), `${fps} ${m}:${s}:${frame}`)
				// Still the same frame just before the next one
				assert.deepEqual(msToHmsf(fps, hmsfToMs(fps, 0, m, s, frame) + Math.floor(1000 / frequency) - 1).frame, frame)
			}
		}
	}
})

test('the framerate is cast to an integer, with no drop frame', () => {
	// 29.97 is 29 fps: frame 28 is the last one, and 1 min is 00:01:00:00
	assert.deepEqual(msToHmsf(29.97, 999), hmsf(0, 0, 0, 28))
	assert.deepEqual(msToHmsf(29.97, 60000), hmsf(0, 1, 0, 0))
	assert.deepEqual(msToHmsf(29.97, 600000), hmsf(0, 10, 0, 0))
	assert.deepEqual(msToHmsf(59.94, 999), hmsf(0, 0, 0, 58))
	assert.deepEqual(msToHmsf(23.976, 999), hmsf(0, 0, 0, 22))
	assert.equal(hmsfToMs(29.97, 0, 0, 0, 29), -1)
	assert.equal(hmsfToMs(23.976, 0, 0, 0, 23), -1)
	// Like TimecodeWidget, a framerate below 1 is 25 fps
	assert.deepEqual(msToHmsf(0, 1000), hmsf(0, 0, 1, 0))
	assert.deepEqual(msToHmsf(0.5, 40), hmsf(0, 0, 0, 1))
	// Unusable framerates
	assert.equal(msToHmsf(undefined, 1000), undefined)
	assert.equal(msToHmsf(NaN, 1000), undefined)
	assert.equal(msToHmsf(-25, 1000), undefined)
	assert.equal(hmsfToMs(0, 0, 0, 1, 0), -1)
	// Invalid timecodes
	assert.equal(hmsfToMs(25, 100, 0, 0, 0), -1)
	assert.equal(hmsfToMs(25, 0, 60, 0, 0), -1)
	assert.equal(hmsfToMs(25, 0, 0, 60, 0), -1)
	assert.equal(hmsfToMs(25, 0, 0, 0, 25), -1)
	assert.equal(hmsfToMs(25, -1, 0, 0, 0), -1)
})

test('timecode texts', () => {
	assert.equal(formatTimecode(25, 0), '00:00:00:00')
	assert.equal(formatTimecode(25, 90480), '00:01:30:12')
	assert.equal(formatTimecode(25, 3600000 * 101), '101:00:00:00')
	assert.equal(formatTimecode(25, -1040), '-00:00:01:01')
	assert.equal(formatTimecode(29.97, 60061), '00:01:00:01')
	assert.equal(formatTimecode(120, 1000 - 1), '00:00:00:119')
	assert.equal(formatTimecode(undefined, 1000), undefined)
	assert.equal(formatTimecode(25, 'abc'), undefined)

	assert.equal(formatTimecodeHms(25, 90480), '00:01:30')
	assert.equal(formatTimecodeHms(29.97, 59999), '00:00:59')
	assert.equal(formatTimecodeHms(25, -1040), '-00:00:01')

	// Countdown: 1 s is added, like Producer
	assert.equal(formatCountdown(0), '00:00:01')
	assert.equal(formatCountdown(999), '00:00:01')
	assert.equal(formatCountdown(1000), '00:00:02')
	assert.equal(formatCountdown(3600000 + 61000 - 1000), '01:01:01')
	assert.equal(formatCountdown(-5), '00:00:01')
	assert.equal(formatCountdown('abc'), undefined)
})
