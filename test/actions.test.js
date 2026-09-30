import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createModule, runAction } from './helpers/fake-context.js'
import { startFakeProducer, waitFor } from './helpers/fake-producer.js'

let producer
let instance
let recorded

before(async () => {
	producer = await startFakeProducer()
	;({ instance, recorded } = await createModule({ host: '127.0.0.1', port: String(producer.port) }))
	await waitFor(() => instance.socket?.isConnected)
})

after(async () => {
	await instance.destroy()
	await producer.close()
})

const cases = [
	['onlineAction', {}, 'online'],
	['quickkeyAction', { quickkeyId: 12 }, 'launchquickkey*12'],
	['testPatternAction', { testPatternId: 6 }, 'setpattern*6'],
	['shutdownMasterAction', {}, 'shutdownmaster'],
	['timelinePlayAction', { timelineId: 3 }, 'play*3'],
	['timelinePauseAction', { timelineId: 3 }, 'locate*3'],
	['timelineOnOffStateAction', { timelineId: 2, state: false }, 'settimelineon*2*0'],
	['timelineGrandMasterAction', { timelineId: 2, value: 50, fadeTime: 1.5 }, 'setgrandmaster*2*50*1500'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 1, layerId: 4, state: true }, 'setlayerblind*1*2*4*0'],
	['timelineLayerOnOffStateAction', { timelineId: 1, layerType: 0, layerId: 4, state: false }, 'setlayerblind*1*0*4*1'],
	['timelineLayerSoloStateAction', { timelineId: 1, layerType: 1, layerId: 5, state: true }, 'setlayersolo*1*2*5*1'],
	['boardPlayAction', { boardId: 7 }, 'setBoardPlayState*7*0*1'],
	['boardPauseAction', { boardId: 7 }, 'setBoardPlayState*7*0*0'],
	['boardEnqueueSequenceAction', { boardId: 1, sequenceId: 3 }, 'enqueueSequenceAndPreset*1*2*-1'],
	['boardEnqueueSequenceAndPresetAction', { boardId: 1, sequenceId: 3, presetId: 2 }, 'enqueueSequenceAndPreset*1*2*1'],
	['boardPlaySequenceAction', { boardId: 1, sequenceId: 3 }, 'playBoard*1*2*1*0'],
	['boardNextAction', { boardId: 1 }, 'boardPlayNext*1*0'],
	['boardNextSequenceAction', { boardId: 1 }, 'boardPlayNext*1*1'],
	['boardNextEnqueuedAction', { boardId: 1 }, 'boardPlayNext*1*2'],
	['boardPreviousAction', { boardId: 1 }, 'boardPlayPrevious*1'],
	['boardOnOffStateAction', { boardId: 1, state: true }, 'setBoardOn*1*1'],
	['boardGrandMasterAction', { baoardId: 2, value: 80, fadeTime: 2 }, 'setBoardGrandMaster*2*80*2000'],
	['boardLayerOnOffStateAction', { boardId: 1, layerId: 1, state: true }, 'setBoardLayerBlind*1*0*0'],
	['boardLayerSoloStateAction', { boardId: 1, layerId: 2, state: true }, 'setBoardLayerSolo*1*1*1'],
]

test('every action is covered', () => {
	const tested = new Set(cases.map(([id]) => id))
	assert.deepEqual(Object.keys(recorded.actionDefinitions).sort(), [...tested].sort())
})

test('actions send the expected line to Producer', async () => {
	for (const [actionId, options, expected] of cases) {
		const count = producer.lines.length
		await runAction(recorded, actionId, options)
		await producer.waitForLines(count + 1)
		assert.equal(producer.lines[count], expected, actionId)
	}
})

test('number options no longer set useVariables', () => {
	for (const definition of Object.values(recorded.actionDefinitions)) {
		for (const option of definition.options) {
			assert.equal(option.useVariables, undefined, `${definition.name} / ${option.id}`)
		}
	}
})
