// Port of the timecode display of Producer (TimecodeWidget, in Onlyview qthelper).
// It uses the integer TimecodeHelpers::Ms_to_HMSF, with the show framerate cast to
// an integer: 29.97 is 29 fps, 59.94 is 59 fps, 23.976 is 23 fps. No drop frame.
// hmsfToMs() is the tc= conversion of Producer (HMSF_to_Ms), its inverse.

// C++ int64 division, exact for integers below 2^53.
function divideFloor(numerator, denominator) {
	return (numerator - (numerator % denominator)) / denominator
}

function divideCeil(numerator, denominator) {
	return divideFloor(numerator + denominator - 1, denominator)
}

// TimecodeWidget::setFrameRate(long): the float framerate is truncated, and 0 becomes 25.
function widgetFrameRate(fps) {
	const frequency = Math.trunc(Math.fround(fps))
	if (!Number.isFinite(frequency) || frequency < 0) return undefined
	return frequency === 0 ? 25 : frequency
}

/**
 * TimecodeHelpers::Ms_to_HMSF, with the framerate of TimecodeWidget.
 * timecodeMs must be a non-negative integer. Undefined if the fps is unusable.
 */
export function msToHmsf(fps, timecodeMs) {
	const frequency = widgetFrameRate(fps)
	if (frequency === undefined) return undefined
	const frameIndex = divideFloor(timecodeMs * frequency, 1000)
	return {
		hour: divideFloor(frameIndex, frequency * 3600),
		minute: divideFloor(frameIndex, frequency * 60) % 60,
		second: divideFloor(frameIndex, frequency) % 60,
		frame: frameIndex % frequency,
	}
}

/**
 * The tc= conversion of Producer: TimecodeHelpers::HMSF_to_Ms, with the framerate cast
 * to an integer. Returns -1 for an invalid timecode, like Producer.
 */
export function hmsfToMs(fps, hour, minute, second, frame) {
	if (hour < 0 || minute < 0 || second < 0 || frame < 0) return -1
	if (hour >= 100 || minute >= 60 || second >= 60) return -1
	const frequency = Math.trunc(Math.fround(fps))
	if (!(frequency > 0) || frame >= frequency) return -1
	const frameIndex = frequency * (hour * 3600 + minute * 60 + second) + frame
	return divideCeil(frameIndex * 1000, frequency)
}

const pad2 = (value) => String(value).padStart(2, '0')

function signedHmsf(fps, timecodeMs) {
	const ms = Math.round(Number(timecodeMs))
	if (!Number.isFinite(ms)) return undefined
	const hmsf = msToHmsf(fps, Math.abs(ms))
	if (!hmsf) return undefined
	return { sign: ms < 0 ? '-' : '', ...hmsf }
}

/**
 * "HH:MM:SS:FF", like the timeline of Producer. A negative tc gets a "-" sign: Producer
 * has no proper display for it. Undefined if the fps is unknown.
 */
export function formatTimecode(fps, timecodeMs) {
	const t = signedHmsf(fps, timecodeMs)
	if (!t) return undefined
	return `${t.sign}${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}:${pad2(t.frame)}`
}

/** "HH:MM:SS", the same timecode without the frames. Undefined if the fps is unknown. */
export function formatTimecodeHms(fps, timecodeMs) {
	const t = signedHmsf(fps, timecodeMs)
	if (!t) return undefined
	return `${t.sign}${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}`
}

/**
 * "HH:MM:SS", like the board countdown of Producer: TimecodeWidget in countdown mode
 * adds 1 s and hides the frames. The seconds do not depend on the fps.
 */
export function formatCountdown(durationMs) {
	const ms = Number(durationMs)
	if (!Number.isFinite(ms)) return undefined
	const seconds = Math.floor((Math.max(0, Math.round(ms)) + 1000) / 1000)
	return `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`
}
