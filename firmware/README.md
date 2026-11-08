# Rycade Pico controls

The default `demo` build exposes four separate USB HID gamepads. The `encoder` build reads the cab's two independent encoder links with PIO UARTs and maps them to those same four gamepads.

## Build

Install the ARM GCC toolchain and Pico SDK 2.1.1, then set `PICO_SDK_PATH`:

```sh
export PICO_SDK_PATH="$HOME/pico-sdk"
cmake -S firmware -B firmware/build-demo -DPICO_SDK_PATH="$PICO_SDK_PATH" -DRYCADE_MODE=demo
cmake --build firmware/build-demo
cmake -S firmware -B firmware/build-encoder -DPICO_SDK_PATH="$PICO_SDK_PATH" -DRYCADE_MODE=encoder
cmake --build firmware/build-encoder
make -C firmware/test
```

The demo UF2 is `firmware/build-demo/rycade_pico.uf2`.

## Encoder mode

Both links use 115200 8N1. The Pico sends `A6 01 00` every 4 ms; each reply is an 18-byte frame beginning `A7 10`. Bytes 4/5 carry the first player's direction/button bytes and bytes 8/9 carry the second player's; bytes 12–17 are zero.

| Link | Signal | Game Port hole | Pico GPIO | Players |
| --- | --- | ---: | ---: | --- |
| A | Pico TX / request | 8 | GP6 | — |
| A | Board RX / reply | 10 | GP7 | P1 (bytes 4/5), P2 (bytes 8/9) |
| B | Pico TX / request | 4 | GP4 | — |
| B | Board RX / reply | 2 | GP3 | P3 (bytes 4/5), P4 (bytes 8/9) |

Direction bits are Right `0x01`, Down `0x02`, Left `0x04`, Up `0x08`, and Start `0x20`. Button bits are btn1/A `0x10`, btn2/X `0x08`, and btn3/B `0x02`.

**Never run the encoder build while the original main board is connected; both would drive holes 4 and 8. Remove the original main board first.** With it removed, connect Pico VBUS pin 40 to Game Port hole 3 (joystick-board 5V) and the shifter HV pin, and connect Pico GND to hole 5.

Build the raw-frame variant with `-DRYCADE_ENCODER_DEBUG=ON` alongside `-DRYCADE_MODE=encoder`; it keeps the four HID gamepads and adds CDC with PID `0x4005`.
CDC lines are `L0 XX XX ... XX` / `L1 XX XX ... XX` (18 uppercase bytes for Link A/Link B).
Use raw dumps to identify unknown encoder inputs, including the cabinet volume slider.

## Sniff mode

Build the CDC-only passive sniffer with `-DRYCADE_MODE=sniff`. It samples the eight signal holes as inputs: `1,2,4,6,8,10,11,12` map to GP2 through GP9 in that order. Connect with a USB CDC terminal; on DTR connect it prints the command help and then `S t=<ms> lv=<8 levels> e=<8 edge counts> hi=<8 minimum high widths> lo=<8 minimum low widths>`. The eight comma-separated `hi` and `lo` values are minimum pulse widths in microseconds, or `-` if no pulse was measured. PIO UART frames print as `U<hole> <length> <hex bytes>`.

The Pico's VBUS must NOT be connected to the cab's 5V when the main board is powering the line. Grounds must be common. Route signal lines through a level shifter or resistor divider; never connect a 5V signal directly to a Pico GPIO.

```sh
cmake -S firmware -B firmware/build-sniff -DPICO_SDK_PATH="$PICO_SDK_PATH" -DRYCADE_MODE=sniff
cmake --build firmware/build-sniff
```

The sniff UF2 is `firmware/build-sniff/rycade_pico.uf2`.

## Flash and test

Hold BOOTSEL while plugging in the Pico, then drag the demo UF2 onto the `RPI-RP2` drive. On the Mac, verify four controllers at [hardwaretester.com/gamepad](https://hardwaretester.com/gamepad) or in System Information → USB.

do not connect J3 to the Pico until the signal voltage has been measured. RP2040 GPIO is not 5V tolerant.
