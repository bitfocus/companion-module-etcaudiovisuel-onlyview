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

All number fields can also be set with an expression, for example `$(custom:board)`.

### Actions

General:

- **Online Displays**: puts all the Displays online.
- **Launch quick key**
- **Test pattern**: shows a test pattern on all the Displays. "None" removes it.
- **Shutdown Master**: shuts down the Producer computer, on Windows only. Producer first shows a 10 second warning, and the user can cancel the shutdown there. See the setup, step 2.

Timelines:

- **Timeline play**: plays from the current position.
- **Timeline pause**: pauses at the current position.
- **Timeline ON/OFF state**
- **Timeline grand master**: value from 0 to 100, with a fade time in seconds.
- **Timeline layer ON/OFF state**
- **Timeline layer solo state**

Boards:

- **Board play** / **Board pause**
- **Board enqueue sequence**: the sequence plays after the current one.
- **Board enqueue sequence and preset**
- **Board play sequence**
- **Board play next sequence**
- **Board play next sequence (sequence + 1)**
- **Board play next sequence (enqueued sequence)**
- **Board play previous sequence**
- **Board ON/OFF state**
- **Board grand master**: value from 0 to 100, with a fade time in seconds.
- **Board layer ON/OFF state**
- **Board layer solo state**

### Troubleshooting

- **The connection is green, but nothing happens**: _Accept remote commands_ is off in Producer (see the setup, step 1).
- **The connection is red or connecting**: check the IP address and port, and check that Producer is running. Producer opens port 3055 only while it runs.
- **"Command dropped, not connected to Producer" in the log**: the button was pressed while the connection was down. Companion does not queue commands: press the button again once the connection is green.
