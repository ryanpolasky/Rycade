# Arcade1Up NBA Jam (4-player) joystick board

Notes from reverse-engineering the control deck of an Arcade1Up NBA Jam four-player cabinet, so the deck can drive something other than the stock Android board. Everything below was measured or sniffed on one cabinet. Where a value is a guess, it says so.

The serial format matches the one documented in [Team-Encoder/A1AndroidControlFix](https://github.com/Team-Encoder/A1AndroidControlFix) for Simpsons, TMNT and "Fighter Droids". NBA Jam differs in two ways: it splits the four players across **two independent links**, and it puts the cabinet controls in different places.

## Hardware

| Part | Marking |
| --- | --- |
| Joystick board (in the control deck) | `TMGD0008B V01`, date code 2020.03.31 |
| Stock main board (Android) | `AK0003R V03` |
| Main-board connector | shrouded 2×6 male header silkscreened `Game Port` |
| Cable | 12-wire ribbon, 2×6 female IDC on the main-board end |

Per player: 8-way digital stick, 3 buttons and Start. The deck also has a spring-return power slider (OFF / neutral / ON), a LIVE button and a spring-return volume slider. All of it comes over the same 12-pin cable.

The separate 4-pin `GND TXD RXD 3V` header on the main board is the main board's own debug UART. It is not the controls.

## Game Port pinout

Numbering: hold the main board with the `Game Port` text upright. The top row is holes 1–6 and the bottom row is holes 7–12, both left to right. The ribbon's red stripe is at the 6/12 end. Looking into the cable's plug (holes toward you, red stripe on the left), the top row reads 6 5 4 3 2 1 and the bottom row reads 12 11 10 9 8 7.

| Hole | Function |
| ---: | --- |
| 3 | +5 V from the main board (powers the joystick board) |
| 5, 7, 9 | GND |
| 8 | Link A, host → board (poll) |
| 10 | Link A, board → host (reply): P1, P2 and the cabinet controls |
| 4 | Link B, host → board (poll) |
| 2 | Link B, board → host (reply): P3 and P4 |
| 1, 6, 11, 12 | No activity seen |

## Electrical

- Treat the links as 5 V logic. The board runs from the 5 V on hole 3. With a BSS138 level shifter attached, the idle reply lines measured 3.5–3.7 V on the cable side. That reading includes the shifter's pull-ups, so it doesn't pin down the board's own drive level.
- RP2040 GPIO is not 5 V tolerant. We use a 4-channel BSS138 shifter (LV = Pico 3V3, HV = hole 3 5V) on all four signal lines.
- **Never drive holes 4/8 while the stock main board is connected**, because both hosts would be talking on the poll lines. Unplug the cable from the main board first. Then the replacement host has to supply 5 V on hole 3 itself (we use the Pico's VBUS) and share ground on hole 5.

## Protocol

Each link is a plain UART: **115200 baud, 8N1**, no handshake or init sequence. The host sends a 3-byte poll, and the board answers with an 18-byte frame:

```
host  → A6 01 00
board → A7 10 xx xx xx xx xx xx xx xx xx xx 00 00 00 00 00 00
```

Our Pico polls both links every 4 ms. It releases a link's players if no valid frame arrives for 100 ms.

The two links are independent: each has its own poll line and its own reply line. If you sniff only one reply wire, two of the four players look dead.

### Frame layout

| Byte | Link A (holes 8 → 10) | Link B (holes 4 → 2) |
| ---: | --- | --- |
| 0–1 | `A7 10` header | `A7 10` header |
| 2 | volume slider: `0x01` neutral, `0x02` up, `0x00` down | unused |
| 3 | always `0x01` | always `0x01` |
| 4 | P1 stick + Start | P3 stick + Start |
| 5 | P1 buttons + cabinet buttons | P3 buttons |
| 7 | `0x02` at idle, meaning unknown | `0x02` at idle, meaning unknown |
| 8 | P2 stick + Start | P4 stick + Start |
| 9 | P2 buttons | P4 buttons |
| 12–17 | zero | zero |

Idle frame: `A7 10 01 01 00 00 00 02 00 00 00 00 00 00 00 00 00 00`.

The A1AndroidControlFix 4-player layout puts P3/P4 in bytes `0x0C`/`0x0D` and `0x10`/`0x11` of a single frame. NBA Jam leaves those bytes zero and uses a second link instead.

### Stick byte (4 / 8)

| Bit | Meaning |
| ---: | --- |
| `0x01` | right |
| `0x02` | down |
| `0x04` | left |
| `0x08` | up |
| `0x20` | Start |

### Button byte (5 / 9)

Names follow A1AndroidControlFix's A/B/C/X/Y/Z bits.

| Bit | Name | On the NBA Jam deck |
| ---: | --- | --- |
| `0x10` | A | button 1 (left) |
| `0x08` | X | button 2 |
| `0x02` | B | button 3 |
| `0x04` | C | **Link A byte 5 only:** power slider bumped to ON (pulses ~0.3 s) |
| `0x01` | Y | **Link A byte 5 only:** power slider bumped to OFF |
| `0x20` | Z | **Link A byte 5 only:** LIVE button |

So the cabinet buttons show up as extra P1 buttons, and a host has to mask them out of P1. In A1AndroidControlFix, volume and LIVE come from a separate system byte (`0x02`) instead. On NBA Jam, byte 2 holds the volume slider position as a value, not as bits.

## Gotchas

- **The deck lights stay off until the power slider sends ON**, even while the board is being polled and is answering. Dark lights don't mean the board is dead.
- The power slider doesn't switch power. It's just two momentary bits, so the host decides what ON/OFF mean.
- Windows enumerates identical USB gamepads in an unstable order (we saw P4 first, P1 last). Name each pad (our firmware uses `Rycade P1`…`Rycade P4`) and map players by name, not by index.

## Reference implementation

[`firmware/`](../firmware) in this repo is a Raspberry Pi Pico (RP2040) build that replaces the stock main board:

- two PIO UARTs: Link A TX GP6 / RX GP7, Link B TX GP4 / RX GP3, through the level shifter
- four USB HID gamepads (`Rycade P1`–`P4`) plus a fifth `Rycade Cabinet` HID interface: power ON = F17, OFF = F18, LIVE = F19, and the volume slider = consumer Volume Up/Down
- `-DRYCADE_ENCODER_DEBUG=ON` adds a USB serial port that prints every changed raw frame as `L0 …` / `L1 …`, which is how the cabinet bits above were found
- `-DRYCADE_MODE=sniff` is a passive sniffer for watching the stock main board talk to the deck

The parser is `firmware/src/encoder.c`, and the build and wiring steps are in [`firmware/README.md`](../firmware/README.md).
