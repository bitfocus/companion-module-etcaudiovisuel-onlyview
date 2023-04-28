module.exports = function (self) {
	self.setActionDefinitions({
		timelinePlayAction: {
			name: 'Timeline play',
			options: [
				{
					type: 'number',
					id: 'timelineId',
					label: 'Timeline Id',
					default: '1',
					min: 1,
					max: 99,
					useVariables: true,
				},
			],
			callback: async (action) => {
				/* Create a binary buffer pre-encoded 'latin1' (8bit no change bytes) sending a string.
				 * Assumes 'utf8' encoding which then escapes character values over 0x7F and destroys
				 * the 'binary' context.
				 */
				const buffer = Buffer.from('play*' + action.options.timelineId + '\n', 'latin1')

				if (self.socket !== undefined && self.socket.isConnected) {
					self.socket.send(buffer)
				} else {
					self.log('debug', 'Socket not connected :(')
				}
			},
		},
	})
}
