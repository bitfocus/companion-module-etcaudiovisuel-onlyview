## ETC Audiovisuel - Onlyview

This module controls an [ETC Audiovisuel - Onlyview](https://etc-onlyview.com/) show through the Producer TCP remote protocol.

### Requirements

- Companion 4.3 or later.
- Onlyview Producer. An action only works if your Onlyview version has the matching feature: for example, board actions need a version with boards.

### Setup

1. In Producer, open _File > Producer Options_, tab _General_, and check _Accept remote commands_. Without it, Producer ignores every command, and the module shows no error.
2. For the "Shutdown Master" action only: in the same dialog, check _Allow the reboot and halt actions on Producer_ (group _Producer actions_).
3. In Companion, add the Onlyview connection:
   - **Producer IP**: the IP address of the Producer computer.
   - **Producer Port**: `3055`. Producer always listens on this port. Change it only if a NAT or a port forward sits between Companion and Producer.

The connection status is green only when the TCP connection to Producer is open.

### Finding the ids

- **Timeline Id**: in the timeline setup dialog ("Timeline Id").
- **Board Id**: in the board setup dialog ("Board Id").
- **Timeline layer Id**: the id of the layer in its timeline. Choose the layer type: command layer or media layer.
- **Board layer**, **Sequence** and **Preset**: counted from 1.
- **Quick key Id**: the number of the quick key.
- **Display Id**: the "Id" column of the Displays tab.
- **Output**: counted from 1, in the order of the outputs of the Display. The default output names use the same number ("Output1", "Audio2"...).
- **Audio channel**: counted from 1.
- **Action graph Id**: a new action graph is named "ActionGraph N", where N is its id. The id does not change when the graph is renamed.
- **Node Id**: the small number in the top right corner of the node.

All number fields can also be set with an expression, for example `$(custom:board)`.

### Timecodes

The locate actions take a timecode as text: `HH:MM:SS:FF` or `HH:MM:SS`, for example `00:01:30:12`. `FF` is a frame number, in the framerate of the show. Producer converts the timecode, like the timecode display of the timeline:

- 29.97 and 59.94 fps use drop frame.
- Other framerates use their integer part: 23.976 fps is handled as 23 fps.
- A frame number equal to or above the framerate is invalid. Producer only logs a warning and uses the current position: "Timeline locate" pauses where the timeline is, and "Timeline locate and play" plays from where it is.

The field accepts variables, for example `$(custom:tc)`. If the text is not a valid timecode, the module logs a warning and sends nothing.

These actions need an Onlyview version that supports timecodes in frames (`tc=`). An older Producer reads `00:01:30:12` as 1 min 30 s and 12 ms. It does not understand `00:01:30` at all, and uses the current position: "Timeline locate and play" then plays from where the timeline is, with no error.

### Actions

General:

- **Online Displays** / **Offline Displays**: puts one Display online or offline. Display Id 0 means all the Displays.
- **Launch quick key**
- **Test pattern**: shows a test pattern on all the Displays. "None" removes it. It also removes the overrides of each output.
- **Override test pattern on output**: shows a test pattern on one output of one Display only. "None" hides the global test pattern on this output. Use "Test pattern" to remove all the overrides.
- **Shutdown Master**: shuts down the Producer computer, on Windows only. Producer first shows a 10 second warning, and the user can cancel the shutdown there. See the setup, step 2.

Timelines:

- **Timeline play**: plays from the current position.
- **Timeline pause**: pauses at the current position.
- **Timeline locate**: goes to the timecode and pauses. See _Timecodes_.
- **Timeline locate and play**: goes to the timecode and plays. See _Timecodes_.
- **Timeline ON/OFF state**
- **Timeline grand master**: value from 0 to 100, with a fade time in seconds.
- **Timeline layer ON/OFF state**
- **Timeline layer solo state**

Boards:

- **Board play** / **Board pause**
- **Board enqueue sequence**: the sequence plays after the current one.
- **Board enqueue sequence and preset**
- **Board play sequence**: plays the sequence now.
  - _Override preset_: plays this preset, instead of the preset of the sequence settings. It only works if the board has a preset board. The Preset Id is a sequence of the preset board, counted from 1. Without a preset board, the option does nothing.
  - _Clear queue_: also removes the enqueued sequence.
- **Board play next sequence**
- **Board play next sequence (sequence + 1)**
- **Board play next sequence (enqueued sequence)**
- **Board play previous sequence**
- **Board ON/OFF state**
- **Board grand master**: value from 0 to 100, with a fade time in seconds.
- **Board layer ON/OFF state**
- **Board layer solo state**

Audio:

- **Audio output volume**: the volume of one audio output, in dBFS, from -80 to +6. Values out of range are clamped.
- **Audio channel state**: the volume (dBFS, -80 to +6), the mute and the test signal of one channel. The action always sets the three values together. For example, a "mute" button also sets the volume of the channel. Give it the volume you want to hear after unmute.

Action graphs:

- **Trigger action graph event**: fires an "On Action" node, like a quick key or a command cue that targets this node. Use the id of an "On Action" node only.

### Troubleshooting

- **The connection is green, but nothing happens**: _Accept remote commands_ is off in Producer (see the setup, step 1).
- **The connection is red or connecting**: check the IP address and port, and check that Producer is running. Producer opens port 3055 only while it runs.
- **"Command dropped, not connected to Producer" in the log**: the button was pressed while the connection was down. Companion does not queue commands: press the button again once the connection is green.
