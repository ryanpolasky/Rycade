/* firmware/src/main.c */
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "encoder.h"
#include "gamepad.h"
#include "hardware/gpio.h"
#include "pico/stdlib.h"
#include "tusb.h"

#if RYCADE_MODE_ENCODER
#include "hardware/uart.h"
#endif

#if !RYCADE_MODE_ENCODER
#include "hardware/regs/io_qspi.h"
#include "hardware/structs/ioqspi.h"
#include "hardware/structs/sio.h"
#include "hardware/sync.h"
#endif

static struct player_state player_states[RYCADE_PLAYER_COUNT];
static struct player_state sent_states[RYCADE_PLAYER_COUNT];
static bool reports_sent[RYCADE_PLAYER_COUNT];
static bool usb_mounted;

void tud_mount_cb(void)
{
    usb_mounted = true;
    memset(reports_sent, 0, sizeof(reports_sent));
}

void tud_umount_cb(void)
{
    usb_mounted = false;
    memset(reports_sent, 0, sizeof(reports_sent));
}

uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type,
                               uint8_t *buffer, uint16_t reqlen)
{
    struct gamepad_report report;
    uint16_t copy_length;

    (void)report_id;
    if (instance >= RYCADE_PLAYER_COUNT || report_type != HID_REPORT_TYPE_INPUT || buffer == NULL) {
        return 0u;
    }

    player_state_to_report(&player_states[instance], &report);
    copy_length = reqlen < sizeof(report) ? reqlen : (uint16_t)sizeof(report);
    memcpy(buffer, &report, copy_length);
    return copy_length;
}

void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type,
                           uint8_t const *buffer, uint16_t bufsize)
{
    (void)instance;
    (void)report_id;
    (void)report_type;
    (void)buffer;
    (void)bufsize;
}

static bool states_equal(const struct player_state *left, const struct player_state *right)
{
    return left->dirs == right->dirs && left->buttons == right->buttons;
}

static void send_changed_reports(void)
{
    if (!usb_mounted) {
        return;
    }

    for (uint8_t player = 0u; player < RYCADE_PLAYER_COUNT; ++player) {
        struct gamepad_report report;

        if (reports_sent[player] && states_equal(&player_states[player], &sent_states[player])) {
            continue;
        }
        if (!tud_hid_n_ready(player)) {
            continue;
        }

        player_state_to_report(&player_states[player], &report);
        if (tud_hid_n_report(player, 0u, &report, sizeof(report))) {
            sent_states[player] = player_states[player];
            reports_sent[player] = true;
        }
    }
}

#if !RYCADE_MODE_ENCODER
bool __no_inline_not_in_flash_func(bootsel_pressed)(void)
{
    const uint CS_PIN_INDEX = 1u;
    uint32_t flags = save_and_disable_interrupts();

    hw_write_masked(&ioqspi_hw->io[CS_PIN_INDEX].ctrl,
                    GPIO_OVERRIDE_LOW << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
                    IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);

    for (volatile uint32_t delay = 0u; delay < 1000u; ++delay) {
    }

    const bool pressed = (sio_hw->gpio_hi_in & (1u << 1)) == 0u;

    hw_write_masked(&ioqspi_hw->io[CS_PIN_INDEX].ctrl,
                    GPIO_OVERRIDE_NORMAL << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
                    IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);

    restore_interrupts(flags);
    return pressed;
}

static void update_demo_states(uint32_t now_ms)
{
    static uint32_t last_button_poll;
    static bool button_a;

    if ((uint32_t)(now_ms - last_button_poll) >= 10u) {
        button_a = bootsel_pressed();
        last_button_poll = now_ms;
    }

    player_states[0].dirs = 0u;
    player_states[0].buttons = button_a ? RYCADE_BUTTON_A : 0u;

    const uint32_t phase = now_ms % 2000u;
    for (uint8_t player = 1u; player < RYCADE_PLAYER_COUNT; ++player) {
        const uint32_t pulse_start = (uint32_t)(player - 1u) * 200u;
        const bool start = phase >= pulse_start && phase < pulse_start + 100u;
        player_states[player].dirs = start ? RYCADE_DIR_START : 0u;
        player_states[player].buttons = 0u;
    }
}
#endif

#if RYCADE_MODE_ENCODER
static uint8_t encoder_frame[18];
static uint8_t encoder_frame_length;

static void receive_encoder_byte(uint8_t byte)
{
    if (encoder_frame_length == 0u) {
        if (byte == 0xA7u) {
            encoder_frame[encoder_frame_length++] = byte;
        }
        return;
    }

    if (encoder_frame_length == 1u && byte != 0x10u) {
        encoder_frame_length = byte == 0xA7u ? 1u : 0u;
        if (encoder_frame_length == 1u) {
            encoder_frame[0] = byte;
        }
        return;
    }

    encoder_frame[encoder_frame_length++] = byte;
    if (encoder_frame_length == sizeof(encoder_frame)) {
        struct player_state parsed[RYCADE_PLAYER_COUNT];
        if (encoder_parse(encoder_frame, sizeof(encoder_frame), parsed)) {
            memcpy(player_states, parsed, sizeof(player_states));
        }
        encoder_frame_length = 0u;
    }
}

static void update_encoder(uint32_t now_us)
{
    static const uint8_t request[] = {0xA6u, 0x01u, 0x00u};
    static uint32_t next_request;

    if ((int32_t)(now_us - next_request) >= 0) {
        uart_write_blocking(uart0, request, sizeof(request));
        next_request = now_us + 4000u;
    }
    while (uart_is_readable(uart0)) {
        receive_encoder_byte((uint8_t)uart_getc(uart0));
    }
}
#endif

int main(void)
{
    gpio_init(PICO_DEFAULT_LED_PIN);
    gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);

#if RYCADE_MODE_ENCODER
    uart_init(uart0, 115200u);
    gpio_set_function(0u, GPIO_FUNC_UART);
    gpio_set_function(1u, GPIO_FUNC_UART);
#endif

    tusb_init();

    while (true) {
        const uint32_t now_ms = to_ms_since_boot(get_absolute_time());
        tud_task();

#if RYCADE_MODE_ENCODER
        update_encoder(time_us_32());
#else
        update_demo_states(now_ms);
#endif

        send_changed_reports();
        gpio_put(PICO_DEFAULT_LED_PIN, usb_mounted || ((now_ms / 100u) & 1u) != 0u);
        sleep_ms(1u);
    }
}
