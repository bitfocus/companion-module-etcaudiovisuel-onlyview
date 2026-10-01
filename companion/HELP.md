## ETC Audiovisuel - Onlyview

This module controls an [ETC Audiovisuel - Onlyview](https://etc-onlyview.com/) show through the Producer TCP remote protocol.

### Requirements

- Companion 4.3 or later.
- Onlyview Producer. An action only works if your Onlyview version has the matching feature: for example, board actions need a version with boards.
- The variables, the feedbacks, the toggles (including play/pause) and the presets made for the ids of the show need an Onlyview version that sends its state to Companion (the `subscribe` remote command). It is the same version as the timecodes in frames (see _Timecodes_). With an older Producer, the actions still work, but the variables stay empty, the feedbacks stay off, the toggles do nothing, and only the presets without state work (see _Presets_).

### Setup

1. In Producer, open _File > Producer Options_, tab _General_, and check _Accept remote commands_. Without it, Producer ignores every command, and the connection turns yellow ("No reply from Producer").
2. For the "Shutdown Master" action only: in the same dialog, check _Allow the reboot and halt actions on Producer_ (group _Producer actions_).
3. In Companion, add the Onlyview connection:
   - **Producer IP**: the IP address of the Producer computer.
   - **Producer Port**: `3055`. Producer always listens on this port. Change it only if a NAT or a port forward sits between Companion and Producer.

The connection status:

- **Green**: connected, and Producer replies.
- **Yellow, "Producer too old for variables, or Accept remote commands is off"**: Producer did not reply to `subscribe` within 2 seconds. The actions still work, but the variables stay empty, and the locates with a timecode log a warning.
- **Yellow, "No reply from Producer"**: the module sends `checkalive` every 2 seconds. Producer did not reply for 5 seconds, so the module reconnects. The most common cause is _Accept remote commands_ turned off.
- **Red** or **Connecting**: no TCP connection.

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

The locate actions take a timecode as text: `HH:MM:SS:FF` or `HH:MM:SS`, for example `00:01:30:12`. `FF` is a frame number, in the framerate of the show. Timecodes match what Producer shows on the timeline:

- Producer uses the integer part of the framerate, with no drop frame. At 29.97 or 59.94 fps, Producer counts 29 or 59 frames per second. At 23.976 fps, it counts 23 frames per second.
- A frame number equal to or above the framerate is invalid. Producer only logs a warning and uses the current position: "Timeline locate" pauses where the timeline is, and "Timeline locate and play" plays from where it is.

The field accepts variables, for example `$(custom:tc)`. If the text is not a valid timecode, the module logs a warning and sends nothing.

These actions need an Onlyview version that supports timecodes in frames (`tc=`). An older Producer reads `00:01:30:12` as 1 min 30 s and 12 ms. It does not understand `00:01:30` at all, and uses the current position: "Timeline locate and play" then plays from where the timeline is, with no error.

### Variables

Producer sends its state to the module when it connects, then each change. The module creates the variables of the timelines, boards and Displays of the open show. When a timeline, board or Display is added or removed in Producer, its variables are added or removed too.

In the names below, `<id>` is the Timeline Id, the Board Id or the Display Id. Sequences are counted from 1, like in the actions.

General:

- `show_fps`: the framerate of the show, for example `25` or `29.97`.

Timelines:

- `tl_<id>_name`: the name of the timeline.
- `tl_<id>_tc`: the timecode, `HH:MM:SS:FF` (see _Timecode formats_ below).
- `tl_<id>_tc_hms`: the timecode, `HH:MM:SS`.
- `tl_<id>_tc_ms`: the timecode in milliseconds, a number.
- `tl_<id>_state`: `Play` or `Pause`.
- `tl_<id>_on`: `ON` or `OFF`.
- `tl_<id>_gm`: the grand master, from 0 to 100.

Boards:

- `board_<id>_name`: the name of the board.
- `board_<id>_state`: `Play` or `Pause`.
- `board_<id>_on`: `ON` or `OFF`.
- `board_<id>_gm`: the grand master, from 0 to 100.
- `board_<id>_seq`, `board_<id>_seq_name`: the number and the name of the current sequence. Empty if no sequence plays.
- `board_<id>_next`, `board_<id>_next_name`: the number and the name of the enqueued sequence. Empty if nothing is enqueued.
- `board_<id>_tc`, `board_<id>_tc_hms`, `board_<id>_tc_ms`: the time in the current sequence, in the same formats as the timelines.
- `board_<id>_remaining`: the time until the end of the current sequence, `HH:MM:SS`. It uses the same format as the board countdown of Producer: it adds 1 second, so it shows `00:00:01` at the end. But it counts to the end of the sequence, without the crossfade to the next sequence. It shows `00:00:00` for an empty sequence. It is empty if the sequence has no end, for example a sequence with only a live input.
- `board_<id>_remaining_ms`: the same time in milliseconds, a number.

Displays:

- `display_<id>_name`: the name of the Display.
- `display_<id>_status`: `Idle`, `Offline`, `Connecting`, `Connected` or `Error`, like the Displays tab of Producer.

Timecode formats:

- `_tc` matches what Producer shows on the timeline. It uses the integer part of the framerate, with no drop frame: at 29.97 or 59.94 fps, Producer counts 29 or 59 frames per second, so the frames go from 00 to 28 or 58. These are the rules of the locate actions, so a timecode read in `tl_<id>_tc` locates at the same frame.
- Producer does not send the timecode continuously. While a timeline or a board plays, the module computes it from its clock, and updates the variables 10 times per second. Producer sends the timecode again after a locate or a jump, so the variables stay in sync.
- For other formats, use `tl_<id>_tc_ms` in an expression, for example `msToTimestamp($(onlyview:tl_1_tc_ms), 'mm:ss')`.

When the connection to Producer is lost, the values are cleared: the timecodes show `--:--:--:--` or `--:--:--`, and the other variables are empty. A frozen timecode never looks live.

Button text examples, on two lines (replace `onlyview` with the label of your connection):

```
$(onlyview:tl_1_name)
$(onlyview:tl_1_tc)
```

```
$(onlyview:board_1_seq_name)
-$(onlyview:board_1_remaining)
```

```
$(onlyview:display_2_name)
$(onlyview:display_2_status)
```

### Feedbacks

All the feedbacks are boolean: they change the style of the button when they are true. Each one has a default style, and Companion can invert it. They read the state that Producer sends, like the variables. They are false when the object does not exist in the show, when the connection is lost, and with a Producer too old to send its state.

- **Producer connection is alive**: connected, and Producer replies to `checkalive`. It is also true with a Producer too old to send its state.
- **Timeline is playing** / **Timeline is paused** / **Timeline is ON**: Timeline Id.
- **Timeline layer is OFF (blind)** / **Timeline layer is solo**: Timeline Id, layer type and Layer Id, like the layer actions.
- **Board is playing** / **Board is paused** / **Board is ON**: Board Id.
- **Board current sequence is**: the sequence plays now. Board Id and Sequence Id, counted from 1.
- **Board enqueued sequence is**: the sequence plays after the current one.
- **Board layer is OFF (blind)** / **Board layer is solo**: Board Id and layer, counted from 1.
- **Display status is**: Display Id and a status: Connected, Offline, Error, Connecting or Idle. It matches `display_<id>_status`.

### On, Off and Toggle

The state actions have a mode: **On**, **Off** or **Toggle**. On and Off always work. Toggle reads the state that Producer sent, and sends the opposite: for example, "Timeline ON/OFF state" in Toggle mode turns a timeline OFF if it is ON. If Producer did not send its state (old Producer, or no connection), or the object does not exist, a toggle sends nothing and logs a warning.

The mode can also be an expression. It must give exactly `on`, `off` or `toggle`, in lowercase. With any other value, Companion skips the action, with no warning.

A toggle uses the last state sent by Producer. If you press the button twice before Producer sends the new state, the module sends the same command twice.

Buttons created before this version had a checkbox. They are converted: checked becomes On, unchecked becomes Off. An expression on the checkbox becomes an expression on the mode: `bool(<expression>) ? "on" : "off"`.

### Presets

The presets are ready-made buttons: drag them from the _Presets_ tab to a button. They use the variables and the feedbacks above. The module builds them for the timelines, boards and Displays of the open show, and updates the list of presets when the show changes. A button you already placed is a copy: it does not change when the show changes. Edit its ids by hand.

When Producer sent no timeline, board or Display (old Producer, or no connection yet), the module gives presets for id 1. With an old Producer, only these presets work: Previous, Next, the sequence buttons, the quick keys, and all Displays online and offline. The toggles, the colors and the texts with variables need the state of Producer (see _Requirements_).

- **Timelines**, for each timeline:
  - Play/pause: green while it plays, yellow while it is paused.
  - Timecode: the name and `tl_<id>_tc`. The text turns green while the timeline plays. No action.
  - ON/OFF toggle: blue while the timeline is ON.
- **Boards**, for each board:
  - Play/pause: green while it plays, yellow while it is paused.
  - Previous and Next: "Board play previous sequence" and "Board play next sequence".
  - Remaining time: the name of the current sequence and `board_<id>_remaining`. No action.
  - ON/OFF toggle: blue while the board is ON.
  - One button per sequence, with "Board play sequence": green while the sequence plays, orange while it is enqueued. The text is the sequence name when the preset is built. It does not follow a later rename.
- **Displays**:
  - One status button per Display: the name and `display_<id>_status`. Green when connected, red when offline, orange in error. A press does nothing, so a tap during a show cannot take a Display offline. To toggle a Display, add the "Display online/offline" action yourself.
  - All Displays online.
  - All Displays offline: hold the button for 1 second. A short press does nothing.
- **Quick keys**: quick keys 1 to 12. Producer does not send the quick keys, so change the Quick key Id in the action if needed.
- **Show / Connection**: the Producer connection (green when it is alive, red otherwise), and the show framerate.

The texts contain the label of the connection, for example `$(onlyview:tl_1_name)`. If you rename the connection, Companion updates the existing buttons.

### Actions

General:

- **Online Displays** / **Offline Displays**: puts one Display online or offline. Display Id 0 means all the Displays.
- **Display online/offline**: one Display, with On / Off / Toggle. Toggle puts an Offline or Idle Display online, and puts it offline in the other cases (Connected, Connecting, Error). With auto-reconnect, a Display in error goes back to Connecting again and again: only offline stops it.
- **Launch quick key**
- **Test pattern**: shows a test pattern on all the Displays. "None" removes it. It also removes the overrides of each output.
- **Override test pattern on output**: shows a test pattern on one output of one Display only. "None" hides the global test pattern on this output. Use "Test pattern" to remove all the overrides.
- **Shutdown Master**: shuts down the Producer computer, on Windows only. Producer first shows a 10 second warning, and the user can cancel the shutdown there. See the setup, step 2.

Timelines:

- **Timeline play**: plays from the current position.
- **Timeline pause**: pauses at the current position.
- **Timeline play/pause**: pauses the timeline if it plays, plays it otherwise. It needs the state of Producer, like the toggles.
- **Timeline locate**: goes to the timecode and pauses. See _Timecodes_.
- **Timeline locate and play**: goes to the timecode and plays. See _Timecodes_.
- **Timeline ON/OFF state**: On / Off / Toggle.
- **Timeline grand master**: value from 0 to 100, with a fade time in seconds.
- **Timeline layer ON/OFF state**: On / Off / Toggle. OFF is the blind state of Producer.
- **Timeline layer solo state**: On / Off / Toggle.

Boards:

- **Board play** / **Board pause**
- **Board play/pause**: pauses the board if it plays, plays it otherwise. It needs the state of Producer, like the toggles.
- **Board enqueue sequence**: the sequence plays after the current one.
- **Board enqueue sequence and preset**
- **Board play sequence**: plays the sequence now.
  - _Override preset_: plays this preset, instead of the preset of the sequence settings. It only works if the board has a preset board. The Preset Id is a sequence of the preset board, counted from 1. Without a preset board, the option does nothing.
  - _Clear queue_: also removes the enqueued sequence.
- **Board play next sequence**
- **Board play next sequence (sequence + 1)**
- **Board play next sequence (enqueued sequence)**
- **Board play previous sequence**
- **Board ON/OFF state**: On / Off / Toggle.
- **Board grand master**: value from 0 to 100, with a fade time in seconds.
- **Board layer ON/OFF state**: On / Off / Toggle. OFF is the blind state of Producer.
- **Board layer solo state**: On / Off / Toggle.

Audio:

- **Audio output volume**: the volume of one audio output, in dBFS, from -80 to +6. Values out of range are clamped.
- **Audio channel state**: the volume (dBFS, -80 to +6), the mute and the test signal of one channel. The action always sets the three values together. For example, a "mute" button also sets the volume of the channel. Give it the volume you want to hear after unmute.

Action graphs:

- **Trigger action graph event**: fires an "On Action" node, like a quick key or a command cue that targets this node. Use the id of an "On Action" node only.

### Troubleshooting

- **The connection is yellow, "No reply from Producer"**, or **nothing happens**: _Accept remote commands_ is off in Producer (see the setup, step 1).
- **The connection is yellow, "Producer too old for variables"**: update Onlyview to get the variables, the feedbacks, the toggles and the presets of the show. The actions still work.
- **A toggle does nothing, and the log says "toggle needs the state of Producer"**: Producer did not send its state. See the line above. Use On or Off instead.
- **A variable shows `$NA`**: the timeline, board or Display does not exist in the open show, or the id is wrong.
- **The connection is red or connecting**: check the IP address and port, and check that Producer is running. Producer opens port 3055 only while it runs.
- **"Command dropped, not connected to Producer" in the log**: the button was pressed while the connection was down. Companion does not queue commands: press the button again once the connection is green.
