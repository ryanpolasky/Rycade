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

## Flash and test

Hold BOOTSEL while plugging in the Pico, then drag the demo UF2 onto the `RPI-RP2` drive. On the Mac, verify four controllers at [hardwaretester.com/gamepad](https://hardwaretester.com/gamepad) or in System Information → USB.

do not connect J3 to the Pico until the signal voltage has been measured. RP2040 GPIO is not 5V tolerant.
