/* firmware/test/test_sniff_logic.c */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "sniff_logic.h"

static void test_channel_map(void)
{
    static const uint8_t holes[SNIFF_CHANNEL_COUNT] = {1u, 2u, 4u, 6u, 8u, 10u, 11u, 12u};
    static const uint8_t gpios[SNIFF_CHANNEL_COUNT] = {2u, 3u, 4u, 5u, 6u, 7u, 8u, 9u};

    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        assert(sniff_channel_map[index].hole == holes[index]);
        assert(sniff_channel_map[index].gpio == gpios[index]);
        assert(sniff_hole_index(holes[index]) == (int)index);
    }
    assert(sniff_hole_index(3u) == -1);
}

static void test_edge_stats(void)
{
    struct sniff_stats stats;

    sniff_stats_init(&stats, 0u, 0u);
    sniff_stats_sample(&stats, 0x01u, 10u);
    sniff_stats_sample(&stats, 0x00u, 18u);
    sniff_stats_sample(&stats, 0x01u, 21u);

    assert(stats.edges[0] == 3u);
    assert(stats.min_low_us[0] == 3u);
    assert(stats.min_high_us[0] == 8u);
    assert((stats.levels & 0x01u) != 0u);

    sniff_stats_reset_interval(&stats);
    assert(stats.edges[0] == 0u);
    assert(stats.min_low_us[0] == UINT32_MAX);
    assert(stats.min_high_us[0] == UINT32_MAX);
    assert((stats.levels & 0x01u) != 0u);
}

static void test_uart_frames(void)
{
    struct sniff_frame_state state = {0};
    struct sniff_frame completed = {0};

    assert(!sniff_frame_feed(&state, 1u, 115200u, 0xA5u, 0u, &completed));
    assert(!sniff_frame_feed(&state, 1u, 115200u, 0x5Au, 50u, &completed));
    assert(!sniff_frame_expire(&state, 224u, &completed));
    assert(sniff_frame_feed(&state, 1u, 115200u, 0x33u, 225u, &completed));
    assert(completed.hole == 1u);
    assert(completed.length == 2u);
    assert(completed.bytes[0] == 0xA5u && completed.bytes[1] == 0x5Au);
    assert(state.length == 1u && state.bytes[0] == 0x33u);
    assert(sniff_frame_expire(&state, 400u, &completed));
    assert(completed.length == 1u && completed.bytes[0] == 0x33u);
}

static void test_commands(void)
{
    struct sniff_command command;

    assert(sniff_command_parse("PuLl NoNe\r\n", &command));
    assert(command.type == SNIFF_COMMAND_PULL && command.pull == SNIFF_PULL_NONE);
    assert(sniff_command_parse("pull UP", &command));
    assert(command.pull == SNIFF_PULL_UP);
    assert(sniff_command_parse("UART 12", &command));
    assert(command.type == SNIFF_COMMAND_UART_START && command.hole == 12u);
    assert(command.baud == 115200u);
    assert(sniff_command_parse("uart 6 9600", &command));
    assert(command.baud == 9600u);
    assert(sniff_command_parse("uart off", &command));
    assert(command.type == SNIFF_COMMAND_UART_OFF);
    assert(sniff_command_parse("inv 11 ON", &command));
    assert(command.type == SNIFF_COMMAND_INVERT && command.enabled);
    assert(sniff_command_parse("inv 8 off", &command));
    assert(!command.enabled);
    assert(sniff_command_parse("help", &command));
    assert(command.type == SNIFF_COMMAND_HELP);
    assert(!sniff_command_parse("uart 3", &command));
    assert(!sniff_command_parse("inv 5 on", &command));
    assert(!sniff_command_parse("uart 6 0", &command));
    assert(!sniff_command_parse("pull sideways", &command));
    assert(!sniff_command_parse("unknown", &command));
    assert(!sniff_command_parse("uart 2 extra 4", &command));
}

int main(void)
{
    test_channel_map();
    test_edge_stats();
    test_uart_frames();
    test_commands();
    puts("sniff logic tests passed");
    return 0;
}
