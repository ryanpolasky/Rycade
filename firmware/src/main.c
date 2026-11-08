/* firmware/src/main.c */
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "cabinet.h"
#include "encoder.h"
#include "gamepad.h"
#include "hardware/gpio.h"
#include "pico/stdlib.h"
#include "tusb.h"

#if RYCADE_MODE_ENCODER
#include "hardware/clocks.h"
#include "hardware/irq.h"
#include "hardware/pio.h"
#include "hardware/sync.h"
#include "uart_rx.pio.h"
#include "uart_tx.pio.h"
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
static uint8_t cabinet_bits;
static uint8_t cabinet_keys_report[3];
static uint8_t cabinet_volume_report_bits;
static uint8_t sent_cabinet_keys[3];
static uint8_t sent_cabinet_volume_report_bits;
static bool cabinet_keys_report_sent;
static bool cabinet_volume_report_sent;
static struct cabinet_volume cabinet_volume_state;
static bool power_on_was_pressed;

void tud_mount_cb(void)
{
    usb_mounted = true;
    memset(reports_sent, 0, sizeof(reports_sent));
    cabinet_keys_report_sent = false;
    cabinet_volume_report_sent = false;
}

void tud_umount_cb(void)
{
    usb_mounted = false;
    memset(reports_sent, 0, sizeof(reports_sent));
    cabinet_keys_report_sent = false;
    cabinet_volume_report_sent = false;
}

uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type,
                               uint8_t *buffer, uint16_t reqlen)
{
    struct gamepad_report report;
    uint16_t copy_length;

    if (instance == RYCADE_PLAYER_COUNT) {
        const uint8_t *cabinet_report;
        uint16_t report_length;

        if (report_type != HID_REPORT_TYPE_INPUT || buffer == NULL) {
            return 0u;
        }
        if (report_id == 1u) {
            cabinet_report = cabinet_keys_report;
            report_length = (uint16_t)sizeof(cabinet_keys_report);
        } else if (report_id == 2u) {
            cabinet_report = &cabinet_volume_report_bits;
            report_length = (uint16_t)sizeof(cabinet_volume_report_bits);
        } else {
            return 0u;
        }
        copy_length = reqlen < report_length ? reqlen : report_length;
        memcpy(buffer, cabinet_report, copy_length);
        return copy_length;
    }

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

static void send_cabinet_reports(uint32_t now_ms)
{
    const bool power_on_pressed = (cabinet_bits & RYCADE_CAB_POWER_ON) != 0u;

    if (tud_suspended() && power_on_pressed && !power_on_was_pressed) {
        (void)tud_remote_wakeup();
    }
    power_on_was_pressed = power_on_pressed;

    cabinet_keys(cabinet_bits, cabinet_keys_report);
    cabinet_volume_report_bits =
        cabinet_volume_update(&cabinet_volume_state, cabinet_bits, now_ms);
    if (!usb_mounted) {
        return;
    }

    if ((!cabinet_keys_report_sent ||
         memcmp(cabinet_keys_report, sent_cabinet_keys, sizeof(cabinet_keys_report)) != 0) &&
        tud_hid_n_ready(RYCADE_PLAYER_COUNT)) {
        if (tud_hid_n_report(RYCADE_PLAYER_COUNT, 1u, cabinet_keys_report,
                             (uint16_t)sizeof(cabinet_keys_report))) {
            memcpy(sent_cabinet_keys, cabinet_keys_report, sizeof(cabinet_keys_report));
            cabinet_keys_report_sent = true;
        }
        return;
    }

    if ((!cabinet_volume_report_sent ||
         cabinet_volume_report_bits != sent_cabinet_volume_report_bits) &&
        tud_hid_n_ready(RYCADE_PLAYER_COUNT) &&
        tud_hid_n_report(RYCADE_PLAYER_COUNT, 2u, &cabinet_volume_report_bits,
                         (uint16_t)sizeof(cabinet_volume_report_bits))) {
        sent_cabinet_volume_report_bits = cabinet_volume_report_bits;
        cabinet_volume_report_sent = true;
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
#define ENCODER_RX_RING_SIZE 64u
#define ENCODER_RX_RING_MASK (ENCODER_RX_RING_SIZE - 1u)
#define ENCODER_TX_FIFO_DEPTH 8u
#define ENCODER_BAUD 115200u

struct encoder_link_pins {
    uint tx;
    uint rx;
};

struct encoder_rx_ring {
    uint8_t bytes[ENCODER_RX_RING_SIZE];
    volatile uint32_t head;
    volatile uint32_t tail;
    volatile bool irq_paused;
};

static const struct encoder_link_pins encoder_link_pins[RYCADE_LINK_COUNT] = {
    {8u, 7u},
    {4u, 3u}
};
static const pio_interrupt_source_t encoder_rx_irq_sources[4] = {
    pis_sm0_rx_fifo_not_empty,
    pis_sm1_rx_fifo_not_empty,
    pis_sm2_rx_fifo_not_empty,
    pis_sm3_rx_fifo_not_empty
};
static struct encoder_rx_ring encoder_rx_rings[RYCADE_LINK_COUNT];
static struct encoder_framer encoder_framers[RYCADE_LINK_COUNT];
static uint encoder_rx_sms[RYCADE_LINK_COUNT];
static uint encoder_tx_sms[RYCADE_LINK_COUNT];

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
#define ENCODER_RAW_LINE_LENGTH \
    (3u + 2u * RYCADE_ENCODER_FRAME_LENGTH + (RYCADE_ENCODER_FRAME_LENGTH - 1u) + 1u)

static uint8_t encoder_debug_latest_frames[RYCADE_LINK_COUNT][RYCADE_ENCODER_FRAME_LENGTH];
static bool encoder_debug_latest_valid[RYCADE_LINK_COUNT];
static uint8_t encoder_debug_printed_frames[RYCADE_LINK_COUNT][RYCADE_ENCODER_FRAME_LENGTH];
static bool encoder_debug_printed_valid[RYCADE_LINK_COUNT];
static bool encoder_debug_was_connected;

static void encoder_debug_try_print(uint8_t link, const uint8_t *frame)
{
    static const char hex_digits[] = "0123456789ABCDEF";
    char line[ENCODER_RAW_LINE_LENGTH];
    size_t length = 0u;

    if (!tud_cdc_connected() ||
        (encoder_debug_printed_valid[link] &&
         memcmp(encoder_debug_printed_frames[link], frame, RYCADE_ENCODER_FRAME_LENGTH) == 0)) {
        return;
    }

    line[length++] = 'L';
    line[length++] = (char)('0' + link);
    line[length++] = ' ';
    for (size_t i = 0u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        if (i != 0u) {
            line[length++] = ' ';
        }
        line[length++] = hex_digits[frame[i] >> 4u];
        line[length++] = hex_digits[frame[i] & 0x0Fu];
    }
    line[length++] = '\n';

    if (tud_cdc_write_available() < (uint32_t)length ||
        tud_cdc_write(line, (uint32_t)length) != (uint32_t)length) {
        return;
    }
    tud_cdc_write_flush();
    memcpy(encoder_debug_printed_frames[link], frame, RYCADE_ENCODER_FRAME_LENGTH);
    encoder_debug_printed_valid[link] = true;
}

static void encoder_debug_frame_received(uint8_t link, const uint8_t *frame)
{
    memcpy(encoder_debug_latest_frames[link], frame, RYCADE_ENCODER_FRAME_LENGTH);
    encoder_debug_latest_valid[link] = true;
    encoder_debug_try_print(link, frame);
}

static void encoder_debug_update_connection(void)
{
    const bool connected = tud_cdc_connected();

    if (connected && !encoder_debug_was_connected) {
        memset(encoder_debug_printed_frames, 0, sizeof(encoder_debug_printed_frames));
        memset(encoder_debug_printed_valid, 0, sizeof(encoder_debug_printed_valid));
        for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
            if (encoder_debug_latest_valid[link]) {
                encoder_debug_try_print(link, encoder_debug_latest_frames[link]);
            }
        }
    }
    encoder_debug_was_connected = connected;
}
#endif

static bool encoder_ring_has_space(const struct encoder_rx_ring *ring)
{
    return (uint32_t)(ring->head - ring->tail) < ENCODER_RX_RING_SIZE;
}

static void encoder_ring_push(struct encoder_rx_ring *ring, uint8_t byte)
{
    const uint32_t head = ring->head;

    ring->bytes[head & ENCODER_RX_RING_MASK] = byte;
    __dmb();
    ring->head = head + 1u;
}

static bool encoder_ring_pop(struct encoder_rx_ring *ring, uint8_t *byte)
{
    const uint32_t tail = ring->tail;
    const uint32_t head = ring->head;

    if (tail == head) {
        return false;
    }
    __dmb();
    *byte = ring->bytes[tail & ENCODER_RX_RING_MASK];
    ring->tail = tail + 1u;
    __dmb();
    return true;
}

static void pio0_rx_irq_handler(void)
{
    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        struct encoder_rx_ring *ring = &encoder_rx_rings[link];
        const uint sm = encoder_rx_sms[link];

        while (!pio_sm_is_rx_fifo_empty(pio0, sm)) {
            if (!encoder_ring_has_space(ring)) {
                ring->irq_paused = true;
                pio_set_irq0_source_enabled(pio0, encoder_rx_irq_sources[sm], false);
                break;
            }

            const uint8_t byte = (uint8_t)(pio_sm_get(pio0, sm) >> 24);
            encoder_ring_push(ring, byte);
        }
    }
}

static void encoder_rx_sm_init(uint sm, uint offset, uint pin)
{
    pio_sm_config config = uart_rx_program_get_default_config(offset);

    gpio_init(pin);
    gpio_disable_pulls(pin);
    gpio_set_dir(pin, GPIO_IN);
    pio_gpio_init(pio0, pin);
    sm_config_set_in_pins(&config, pin);
    sm_config_set_jmp_pin(&config, pin);
    sm_config_set_in_shift(&config, true, false, 32u);
    sm_config_set_fifo_join(&config, PIO_FIFO_JOIN_RX);
    sm_config_set_clkdiv(&config,
                         (float)clock_get_hz(clk_sys) / (8.0f * (float)ENCODER_BAUD));
    pio_sm_init(pio0, sm, offset, &config);
    pio_sm_set_consecutive_pindirs(pio0, sm, pin, 1u, false);
}

static void encoder_tx_sm_init(uint sm, uint offset, uint pin)
{
    const uint64_t pin_mask = 1ull << pin;
    pio_sm_config config = uart_tx_program_get_default_config(offset);

    gpio_disable_pulls(pin);
    pio_sm_set_pins_with_mask64(pio0, sm, pin_mask, pin_mask);
    pio_sm_set_pindirs_with_mask64(pio0, sm, pin_mask, pin_mask);
    pio_gpio_init(pio0, pin);
    sm_config_set_out_shift(&config, true, false, 32u);
    sm_config_set_out_pins(&config, pin, 1u);
    sm_config_set_sideset_pins(&config, pin);
    sm_config_set_fifo_join(&config, PIO_FIFO_JOIN_TX);
    sm_config_set_clkdiv(&config,
                         (float)clock_get_hz(clk_sys) / (8.0f * (float)ENCODER_BAUD));
    pio_sm_init(pio0, sm, offset, &config);
}

static void encoder_pio_init(void)
{
    const uint rx_offset = pio_add_program(pio0, &uart_rx_program);
    const uint tx_offset = pio_add_program(pio0, &uart_tx_program);

    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        encoder_rx_sms[link] = pio_claim_unused_sm(pio0, true);
    }
    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        encoder_tx_sms[link] = pio_claim_unused_sm(pio0, true);
    }

    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        encoder_rx_sm_init(encoder_rx_sms[link], rx_offset, encoder_link_pins[link].rx);
        encoder_tx_sm_init(encoder_tx_sms[link], tx_offset, encoder_link_pins[link].tx);
    }

    irq_set_exclusive_handler(PIO0_IRQ_0, pio0_rx_irq_handler);
    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        pio_set_irq0_source_enabled(
            pio0, encoder_rx_irq_sources[encoder_rx_sms[link]], true);
    }
    irq_set_enabled(PIO0_IRQ_0, true);

    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        pio_sm_set_enabled(pio0, encoder_tx_sms[link], true);
        pio_sm_set_enabled(pio0, encoder_rx_sms[link], true);
    }
}

static void drain_encoder_rings(uint32_t now_ms)
{
    static uint32_t last_valid_ms[RYCADE_LINK_COUNT];
    static bool link_has_valid_frame[RYCADE_LINK_COUNT];

    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        struct encoder_rx_ring *ring = &encoder_rx_rings[link];
        uint8_t byte;

        while (encoder_ring_pop(ring, &byte)) {
            if (encoder_framer_push(&encoder_framers[link], byte)) {
#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
                encoder_debug_frame_received(link, encoder_framers[link].frame);
#endif
                if (encoder_parse(encoder_framers[link].frame,
                                  RYCADE_ENCODER_FRAME_LENGTH, link, player_states,
                                  &cabinet_bits)) {
                    last_valid_ms[link] = now_ms;
                    link_has_valid_frame[link] = true;
                }
            }
        }

        if (ring->irq_paused) {
            ring->irq_paused = false;
            pio_set_irq0_source_enabled(
                pio0, encoder_rx_irq_sources[encoder_rx_sms[link]], true);
        }

        if (link_has_valid_frame[link] &&
            (uint32_t)(now_ms - last_valid_ms[link]) >= 100u) {
            memset(&player_states[(size_t)link * 2u], 0,
                   2u * sizeof(player_states[0]));
            if (link == 0u) {
                cabinet_bits = 0u;
            }
            link_has_valid_frame[link] = false;
        }
    }
}

static void send_encoder_requests(uint32_t now_us)
{
    static const uint8_t request[] = {0xA6u, 0x01u, 0x00u};
    static uint32_t next_request_us;

    if ((int32_t)(now_us - next_request_us) < 0) {
        return;
    }

    for (uint8_t link = 0u; link < RYCADE_LINK_COUNT; ++link) {
        const uint sm = encoder_tx_sms[link];
        if (pio_sm_get_tx_fifo_level(pio0, sm) <=
            ENCODER_TX_FIFO_DEPTH - (uint)sizeof(request)) {
            for (size_t i = 0u; i < sizeof(request); ++i) {
                pio_sm_put(pio0, sm, request[i]);
            }
        }
    }
    next_request_us = now_us + 4000u;
}

static void update_encoder(uint32_t now_us, uint32_t now_ms)
{
#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
    encoder_debug_update_connection();
#endif
    drain_encoder_rings(now_ms);
    send_encoder_requests(now_us);
}
#endif

int main(void)
{
    gpio_init(PICO_DEFAULT_LED_PIN);
    gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);

#if RYCADE_MODE_ENCODER
    encoder_pio_init();
#endif

    tusb_init();

    while (true) {
        const uint32_t now_ms = to_ms_since_boot(get_absolute_time());
        tud_task();

#if RYCADE_MODE_ENCODER
        update_encoder(time_us_32(), now_ms);
#else
        update_demo_states(now_ms);
#endif

        send_changed_reports();
        send_cabinet_reports(now_ms);
        gpio_put(PICO_DEFAULT_LED_PIN, usb_mounted || ((now_ms / 100u) & 1u) != 0u);
        sleep_ms(1u);
    }
}
