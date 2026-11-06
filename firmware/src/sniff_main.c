/* firmware/src/sniff_main.c */
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "hardware/clocks.h"
#include "hardware/gpio.h"
#include "hardware/pio.h"
#include "hardware/sync.h"
#include "pico/multicore.h"
#include "pico/stdlib.h"
#include "sniff_logic.h"
#include "tusb.h"
#include "uart_rx.pio.h"

#define SNIFF_UART_RECEIVER_COUNT 2u
#define SNIFF_LINE_BUFFER_SIZE (SNIFF_FRAME_MAX_BYTES * 3u + 32u)

struct sniff_uart_receiver {
    bool active;
    uint8_t hole;
    uint8_t gpio;
    uint32_t baud;
    PIO pio;
    uint sm;
    uint offset;
    struct sniff_frame_state frame;
};

static struct sniff_stats shared_stats;
static spin_lock_t *stats_lock;
static struct sniff_uart_receiver receivers[SNIFF_UART_RECEIVER_COUNT];
static bool inverted_channels[SNIFF_CHANNEL_COUNT];
static bool uart_program_loaded;
static uint uart_program_offset;
static bool usb_mounted;
static char command_line[SNIFF_COMMAND_MAX_LENGTH + 1u];
static size_t command_length;
static bool command_overflow;

void tud_mount_cb(void)
{
    usb_mounted = true;
}

void tud_umount_cb(void)
{
    usb_mounted = false;
}

static uint8_t sample_levels(uint32_t gpio_values)
{
    uint8_t levels = 0u;

    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        if ((gpio_values & (1u << sniff_channel_map[index].gpio)) != 0u) {
            levels |= (uint8_t)(1u << index);
        }
    }
    return levels;
}

static void sampler_core1(void)
{
    for (;;) {
        const uint32_t gpio_values = gpio_get_all();
        const uint32_t now_us = time_us_32();
        const uint8_t levels = sample_levels(gpio_values);
        const uint32_t irq_state = spin_lock_blocking(stats_lock);

        sniff_stats_sample(&shared_stats, levels, now_us);
        spin_unlock(stats_lock, irq_state);
    }
}

static void cdc_write_text(const char *text)
{
    size_t offset = 0u;
    const size_t length = strlen(text);

    if (!tud_cdc_connected()) {
        return;
    }
    while (offset < length) {
        const uint32_t written = tud_cdc_write(text + offset, (uint32_t)(length - offset));
        if (written == 0u) {
            if (!tud_cdc_connected()) {
                return;
            }
            tud_cdc_write_flush();
            tud_task();
            continue;
        }
        offset += written;
    }
    tud_cdc_write_flush();
}

static void print_help(void)
{
    cdc_write_text("Commands: pull none|up|down; uart <hole> [baud]; uart off; "
                   "inv <hole> on|off; help\n");
}

static void print_stats(const struct sniff_stats *stats, uint32_t now_ms)
{
    char line[512];
    size_t length = 0u;
    int written = snprintf(line, sizeof(line), "S t=%lu lv=",
                           (unsigned long)now_ms);

    if (written < 0 || (size_t)written >= sizeof(line)) {
        return;
    }
    length = (size_t)written;

    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        line[length++] = (stats->levels & (uint8_t)(1u << index)) != 0u ? '1' : '0';
    }
    written = snprintf(line + length, sizeof(line) - length, " e=");
    if (written < 0) {
        return;
    }
    length += (size_t)written;

    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        written = snprintf(line + length, sizeof(line) - length, "%s%lu",
                           index == 0u ? "" : ",",
                           (unsigned long)stats->edges[index]);
        if (written < 0 || (size_t)written >= sizeof(line) - length) {
            return;
        }
        length += (size_t)written;
    }

    written = snprintf(line + length, sizeof(line) - length, " hi=");
    if (written < 0 || (size_t)written >= sizeof(line) - length) {
        return;
    }
    length += (size_t)written;
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        if (stats->min_high_us[index] == UINT32_MAX) {
            written = snprintf(line + length, sizeof(line) - length, "%s-",
                               index == 0u ? "" : ",");
        } else {
            written = snprintf(line + length, sizeof(line) - length, "%s%lu",
                               index == 0u ? "" : ",",
                               (unsigned long)stats->min_high_us[index]);
        }
        if (written < 0 || (size_t)written >= sizeof(line) - length) {
            return;
        }
        length += (size_t)written;
    }

    written = snprintf(line + length, sizeof(line) - length, " lo=");
    if (written < 0 || (size_t)written >= sizeof(line) - length) {
        return;
    }
    length += (size_t)written;
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        if (stats->min_low_us[index] == UINT32_MAX) {
            written = snprintf(line + length, sizeof(line) - length, "%s-",
                               index == 0u ? "" : ",");
        } else {
            written = snprintf(line + length, sizeof(line) - length, "%s%lu",
                               index == 0u ? "" : ",",
                               (unsigned long)stats->min_low_us[index]);
        }
        if (written < 0 || (size_t)written >= sizeof(line) - length) {
            return;
        }
        length += (size_t)written;
    }
    if (length + 1u < sizeof(line)) {
        line[length++] = '\n';
        line[length] = '\0';
        cdc_write_text(line);
    }
}

static void print_uart_frame(const struct sniff_frame *frame)
{
    char line[SNIFF_LINE_BUFFER_SIZE];
    size_t length = 0u;
    int written = snprintf(line, sizeof(line), "U%u %u",
                           (unsigned)frame->hole, (unsigned)frame->length);

    if (written < 0 || (size_t)written >= sizeof(line)) {
        return;
    }
    length = (size_t)written;
    for (size_t index = 0u; index < frame->length; ++index) {
        written = snprintf(line + length, sizeof(line) - length, " %02X",
                           (unsigned)frame->bytes[index]);
        if (written < 0 || (size_t)written >= sizeof(line) - length) {
            return;
        }
        length += (size_t)written;
    }
    if (length + 1u < sizeof(line)) {
        line[length++] = '\n';
        line[length] = '\0';
        cdc_write_text(line);
    }
}

static int active_receiver_for_hole(uint8_t hole)
{
    for (size_t slot = 0u; slot < SNIFF_UART_RECEIVER_COUNT; ++slot) {
        if (receivers[slot].active && receivers[slot].hole == hole) {
            return (int)slot;
        }
    }
    return -1;
}

static void stop_receiver(size_t slot)
{
    struct sniff_uart_receiver *receiver = &receivers[slot];

    if (!receiver->active) {
        return;
    }
    pio_sm_set_enabled(receiver->pio, receiver->sm, false);
    pio_sm_clear_fifos(receiver->pio, receiver->sm);
    pio_sm_unclaim(receiver->pio, receiver->sm);
    gpio_set_function(receiver->gpio, GPIO_FUNC_SIO);
    gpio_set_dir(receiver->gpio, GPIO_IN);
    gpio_set_inover(receiver->gpio, GPIO_OVERRIDE_NORMAL);
    memset(receiver, 0, sizeof(*receiver));
}

static bool start_receiver(uint8_t hole, uint32_t baud)
{
    const int channel_index = sniff_hole_index(hole);
    uint8_t gpio;
    int slot = active_receiver_for_hole(hole);
    float divider;
    pio_sm_config config;
    struct sniff_uart_receiver *receiver;

    if (channel_index < 0 || baud == 0u) {
        return false;
    }
    gpio = sniff_channel_map[channel_index].gpio;
    divider = (float)clock_get_hz(clk_sys) / (8.0f * (float)baud);
    if (divider < 1.0f || divider > 65535.0f) {
        return false;
    }
    if (slot >= 0) {
        stop_receiver((size_t)slot);
        slot = -1;
    }
    if (slot < 0) {
        for (size_t index = 0u; index < SNIFF_UART_RECEIVER_COUNT; ++index) {
            if (!receivers[index].active) {
                slot = (int)index;
                break;
            }
        }
    }
    if (slot < 0) {
        return false;
    }

    if (!uart_program_loaded) {
        if (!pio_can_add_program(pio0, &uart_rx_program)) {
            return false;
        }
        uart_program_offset = pio_add_program(pio0, &uart_rx_program);
        uart_program_loaded = true;
    }
    const int sm = pio_claim_unused_sm(pio0, false);
    if (sm < 0) {
        return false;
    }

    receiver = &receivers[slot];
    receiver->pio = pio0;
    receiver->sm = (uint)sm;
    receiver->offset = uart_program_offset;
    receiver->hole = hole;
    receiver->gpio = gpio;
    receiver->baud = baud;
    pio_gpio_init(receiver->pio, gpio);
    pio_sm_set_consecutive_pindirs(receiver->pio, receiver->sm, gpio, 1u, false);
    gpio_set_dir(gpio, GPIO_IN);
    gpio_set_inover(gpio, inverted_channels[channel_index] ? GPIO_OVERRIDE_INVERT :
                                                              GPIO_OVERRIDE_NORMAL);

    config = uart_rx_program_get_default_config(receiver->offset);
    sm_config_set_in_pins(&config, gpio);
    sm_config_set_jmp_pin(&config, gpio);
    sm_config_set_in_shift(&config, true, false, 32u);
    sm_config_set_fifo_join(&config, PIO_FIFO_JOIN_RX);
    sm_config_set_clkdiv(&config, divider);
    pio_sm_init(receiver->pio, receiver->sm, receiver->offset, &config);
    pio_sm_set_enabled(receiver->pio, receiver->sm, true);
    receiver->active = true;
    return true;
}

static void stop_all_receivers(void)
{
    for (size_t slot = 0u; slot < SNIFF_UART_RECEIVER_COUNT; ++slot) {
        stop_receiver(slot);
    }
}

static void print_command_error(const char *text)
{
    char response[SNIFF_COMMAND_MAX_LENGTH + 8u];
    (void)snprintf(response, sizeof(response), "? %s\n", text);
    cdc_write_text(response);
}

static void handle_command(const char *text)
{
    struct sniff_command command;

    if (!sniff_command_parse(text, &command)) {
        print_command_error(text);
        return;
    }

    switch (command.type) {
    case SNIFF_COMMAND_PULL:
        for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
            const uint gpio = sniff_channel_map[index].gpio;
            gpio_set_pulls(gpio, command.pull == SNIFF_PULL_UP,
                           command.pull == SNIFF_PULL_DOWN);
        }
        cdc_write_text("OK pull\n");
        break;
    case SNIFF_COMMAND_UART_START:
        if (start_receiver(command.hole, command.baud)) {
            char response[48];
            (void)snprintf(response, sizeof(response), "OK uart %u %lu\n",
                           (unsigned)command.hole, (unsigned long)command.baud);
            cdc_write_text(response);
        } else {
            print_command_error("max 2 receivers or baud out of range");
        }
        break;
    case SNIFF_COMMAND_UART_OFF:
        stop_all_receivers();
        cdc_write_text("OK uart off\n");
        break;
    case SNIFF_COMMAND_INVERT: {
        const int channel_index = sniff_hole_index(command.hole);
        inverted_channels[channel_index] = command.enabled;
        if (active_receiver_for_hole(command.hole) >= 0) {
            gpio_set_inover(sniff_channel_map[channel_index].gpio,
                            command.enabled ? GPIO_OVERRIDE_INVERT : GPIO_OVERRIDE_NORMAL);
        }
        cdc_write_text(command.enabled ? "OK inv on\n" : "OK inv off\n");
        break;
    }
    case SNIFF_COMMAND_HELP:
        print_help();
        break;
    case SNIFF_COMMAND_INVALID:
    default:
        print_command_error(text);
        break;
    }
}

static void process_cdc_input(void)
{
    while (tud_cdc_available() > 0u) {
        const int32_t input = tud_cdc_read_char();

        if (input < 0) {
            break;
        }
        if (input == '\n') {
            if (command_overflow) {
                print_command_error("command too long");
            } else {
                command_line[command_length] = '\0';
                handle_command(command_line);
            }
            command_length = 0u;
            command_overflow = false;
        } else if (input != '\r') {
            if (command_length < SNIFF_COMMAND_MAX_LENGTH) {
                command_line[command_length++] = (char)input;
            } else {
                command_overflow = true;
            }
        }
    }
}

static void poll_uart_receivers(void)
{
    for (size_t slot = 0u; slot < SNIFF_UART_RECEIVER_COUNT; ++slot) {
        struct sniff_uart_receiver *receiver = &receivers[slot];
        struct sniff_frame completed;

        if (!receiver->active) {
            continue;
        }
        while (!pio_sm_is_rx_fifo_empty(receiver->pio, receiver->sm)) {
            const uint8_t byte = (uint8_t)(pio_sm_get(receiver->pio, receiver->sm) >> 24u);
            if (sniff_frame_feed(&receiver->frame, receiver->hole, receiver->baud,
                                 byte, time_us_32(), &completed)) {
                print_uart_frame(&completed);
            }
        }
        if (sniff_frame_expire(&receiver->frame, time_us_32(), &completed)) {
            print_uart_frame(&completed);
        }
    }
}

int main(void)
{
    uint32_t gpio_values;
    uint32_t now_us;
    uint32_t last_report_ms;
    bool was_connected = false;

    gpio_init(PICO_DEFAULT_LED_PIN);
    gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        const uint gpio = sniff_channel_map[index].gpio;
        gpio_init(gpio);
        gpio_set_dir(gpio, GPIO_IN);
        gpio_disable_pulls(gpio);
        gpio_set_inover(gpio, GPIO_OVERRIDE_NORMAL);
    }

    gpio_values = gpio_get_all();
    now_us = time_us_32();
    sniff_stats_init(&shared_stats, sample_levels(gpio_values), now_us);
    stats_lock = spin_lock_instance(spin_lock_claim_unused(true));
    last_report_ms = now_us / 1000u;

    tusb_init();
    multicore_launch_core1(sampler_core1);

    for (;;) {
        const uint32_t now_ms = time_us_32() / 1000u;
        bool connected;

        tud_task();
        connected = tud_cdc_connected();
        if (connected && !was_connected) {
            cdc_write_text("RYCADE-SNIFF v1 holes=1,2,4,6,8,10,11,12 gp=2-9\n");
            print_help();
        }
        was_connected = connected;
        process_cdc_input();
        poll_uart_receivers();

        if ((uint32_t)(now_ms - last_report_ms) >= 250u) {
            struct sniff_stats snapshot;
            const uint32_t irq_state = spin_lock_blocking(stats_lock);

            snapshot = shared_stats;
            sniff_stats_reset_interval(&shared_stats);
            spin_unlock(stats_lock, irq_state);
            last_report_ms = now_ms;
            if (connected) {
                print_stats(&snapshot, now_ms);
            }
        }

        gpio_put(PICO_DEFAULT_LED_PIN, usb_mounted || ((now_ms / 100u) & 1u) != 0u);
    }
}
