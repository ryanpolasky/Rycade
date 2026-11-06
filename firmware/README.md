# Rycade Pico controls

The default `demo` build exposes four separate USB HID gamepads. The `encoder` build reads the cab encoder over UART0 and is included for later wiring.

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
