/* firmware/test/test_encoder.c */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "encoder.h"
#include "gamepad.h"

static const uint8_t idle_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x00u, 0x00u, 0x00u, 0x02u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static const uint8_t p1_up_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x08u, 0x00u, 0x00u, 0x02u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static const uint8_t p1_btn1_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x00u, 0x10u, 0x00u, 0x02u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static const uint8_t p2_up_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x00u, 0x00u, 0x00u, 0x02u,
    0x08u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static const uint8_t p2_btn1_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x00u, 0x00u, 0x00u, 0x02u,
    0x00u, 0x10u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static const uint8_t p2_start_frame[RYCADE_ENCODER_FRAME_LENGTH] = {
    0xA7u, 0x10u, 0x01u, 0x01u, 0x00u, 0x00u, 0x00u, 0x02u,
    0x20u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u
};

static void assert_players_equal(const struct player_state *actual,
                                 const struct player_state *expected)
{
    assert(memcmp(actual, expected, sizeof(*actual) * RYCADE_PLAYER_COUNT) == 0);
}

static void test_parser(void)
{
    struct player_state states[RYCADE_PLAYER_COUNT] = {
        {0xFFu, 0xFFu}, {0xFEu, 0xFEu}, {0xFDu, 0xFDu}, {0xFCu, 0xFCu}
    };
    const struct player_state untouched[RYCADE_PLAYER_COUNT] = {
        {0xFFu, 0xFFu}, {0xFEu, 0xFEu}, {0xFDu, 0xFDu}, {0xFCu, 0xFCu}
    };
    uint8_t bad_header[RYCADE_ENCODER_FRAME_LENGTH];
    uint8_t cabinet = 0xA5u;
    uint8_t panel_frame[RYCADE_ENCODER_FRAME_LENGTH];

    assert(encoder_parse(idle_frame, sizeof(idle_frame), 0u, states, &cabinet));
    assert(cabinet == 0u);
    assert(states[0].dirs == 0u && states[0].buttons == 0u);
    assert(states[1].dirs == 0u && states[1].buttons == 0u);
    assert(states[2].dirs == untouched[2].dirs && states[2].buttons == untouched[2].buttons);
    assert(states[3].dirs == untouched[3].dirs && states[3].buttons == untouched[3].buttons);

    cabinet = 0x5Au;
    assert(encoder_parse(idle_frame, sizeof(idle_frame), 1u, states, &cabinet));
    assert(cabinet == 0x5Au);
    assert(states[2].dirs == 0u && states[2].buttons == 0u);
    assert(states[3].dirs == 0u && states[3].buttons == 0u);

    assert(encoder_parse(p1_up_frame, sizeof(p1_up_frame), 0u, states, &cabinet));
    assert(states[0].dirs == RYCADE_DIR_UP && states[0].buttons == 0u);
    assert(states[1].dirs == 0u && states[1].buttons == 0u);
    assert(encoder_parse(p1_btn1_frame, sizeof(p1_btn1_frame), 0u, states, &cabinet));
    assert(states[0].dirs == 0u && states[0].buttons == RYCADE_BUTTON_A);
    assert(encoder_parse(p2_up_frame, sizeof(p2_up_frame), 0u, states, &cabinet));
    assert(states[1].dirs == RYCADE_DIR_UP && states[1].buttons == 0u);
    assert(encoder_parse(p2_btn1_frame, sizeof(p2_btn1_frame), 0u, states, &cabinet));
    assert(states[1].dirs == 0u && states[1].buttons == RYCADE_BUTTON_A);
    assert(encoder_parse(p2_start_frame, sizeof(p2_start_frame), 0u, states, &cabinet));
    assert(states[1].dirs == RYCADE_DIR_START && states[1].buttons == 0u);

    memcpy(panel_frame, idle_frame, sizeof(panel_frame));
    panel_frame[0x02u] = 0x02u;
    panel_frame[0x05u] = RYCADE_BUTTON_A | RYCADE_BUTTON_C |
                         RYCADE_BUTTON_Y | RYCADE_BUTTON_Z;
    assert(encoder_parse(panel_frame, sizeof(panel_frame), 0u, states, &cabinet));
    assert(states[0].buttons == RYCADE_BUTTON_A);
    assert(cabinet == (RYCADE_CAB_POWER_ON | RYCADE_CAB_POWER_OFF |
                       RYCADE_CAB_LIVE | RYCADE_CAB_VOL_UP));

    panel_frame[0x02u] = 0x00u;
    assert(encoder_parse(panel_frame, sizeof(panel_frame), 0u, states, &cabinet));
    assert(cabinet == (RYCADE_CAB_POWER_ON | RYCADE_CAB_POWER_OFF |
                       RYCADE_CAB_LIVE | RYCADE_CAB_VOL_DOWN));
    panel_frame[0x02u] = 0x01u;
    assert(encoder_parse(panel_frame, sizeof(panel_frame), 0u, states, &cabinet));
    assert(cabinet == (RYCADE_CAB_POWER_ON | RYCADE_CAB_POWER_OFF | RYCADE_CAB_LIVE));
    panel_frame[0x02u] = 0x05u;
    assert(encoder_parse(panel_frame, sizeof(panel_frame), 0u, states, &cabinet));
    assert(cabinet == (RYCADE_CAB_POWER_ON | RYCADE_CAB_POWER_OFF | RYCADE_CAB_LIVE));

    memcpy(panel_frame, idle_frame, sizeof(panel_frame));
    panel_frame[0x05u] = RYCADE_BUTTON_C;
    states[0] = (struct player_state){0x31u, 0x42u};
    states[1] = (struct player_state){0x53u, 0x64u};
    cabinet = 0x69u;
    assert(encoder_parse(panel_frame, sizeof(panel_frame), 1u, states, &cabinet));
    assert(states[0].dirs == 0x31u && states[0].buttons == 0x42u);
    assert(states[1].dirs == 0x53u && states[1].buttons == 0x64u);
    assert(states[2].dirs == 0u && states[2].buttons == RYCADE_BUTTON_C);
    assert(cabinet == 0x69u);
    assert(encoder_parse(p2_btn1_frame, sizeof(p2_btn1_frame), 1u, states, NULL));
    assert(states[3].dirs == 0u && states[3].buttons == RYCADE_BUTTON_A);

    memcpy(states, untouched, sizeof(states));
    cabinet = 0x7Bu;
    assert(!encoder_parse(idle_frame, sizeof(idle_frame) - 1u, 0u, states, &cabinet));
    assert(cabinet == 0x7Bu);
    assert_players_equal(states, untouched);
    assert(!encoder_parse(NULL, sizeof(idle_frame), 0u, states, &cabinet));
    assert(cabinet == 0x7Bu);
    assert_players_equal(states, untouched);
    assert(!encoder_parse(idle_frame, sizeof(idle_frame), 0u, NULL, &cabinet));
    assert(cabinet == 0x7Bu);
    assert_players_equal(states, untouched);
    memcpy(bad_header, idle_frame, sizeof(bad_header));
    bad_header[0] = 0u;
    assert(!encoder_parse(bad_header, sizeof(bad_header), 0u, states, &cabinet));
    assert(cabinet == 0x7Bu);
    assert_players_equal(states, untouched);
    assert(!encoder_parse(idle_frame, sizeof(idle_frame), 2u, states, &cabinet));
    assert(cabinet == 0x7Bu);
    assert_players_equal(states, untouched);
    assert(encoder_parse(idle_frame, sizeof(idle_frame), 0u, states, NULL));
}

static void assert_framer_reads(const uint8_t *frame)
{
    struct encoder_framer framer = {0};

    encoder_framer_reset(&framer);
    for (size_t i = 0u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        const bool complete = encoder_framer_push(&framer, frame[i]);
        assert(complete == (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
    }
    assert(memcmp(framer.frame, frame, RYCADE_ENCODER_FRAME_LENGTH) == 0);
    assert(framer.length == 0u);
}

static void test_framer(void)
{
    struct encoder_framer framer = {0};
    static const uint8_t garbage[] = {0x00u, 0x10u, 0xA6u};

    assert_framer_reads(p1_up_frame);

    encoder_framer_reset(&framer);
    for (size_t i = 0u; i < 7u; ++i) {
        assert(!encoder_framer_push(&framer, p1_up_frame[i]));
    }
    assert(framer.length == 7u);
    for (size_t i = 7u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        assert(encoder_framer_push(&framer, p1_up_frame[i]) ==
               (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
    }
    assert(memcmp(framer.frame, p1_up_frame, RYCADE_ENCODER_FRAME_LENGTH) == 0);

    encoder_framer_reset(&framer);
    for (size_t i = 0u; i < sizeof(garbage); ++i) {
        assert(!encoder_framer_push(&framer, garbage[i]));
    }
    assert(framer.length == 0u);
    for (size_t i = 0u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        assert(encoder_framer_push(&framer, p1_up_frame[i]) ==
               (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
    }

    encoder_framer_reset(&framer);
    assert(!encoder_framer_push(&framer, 0xA7u));
    assert(!encoder_framer_push(&framer, 0xA7u));
    assert(framer.length == 1u && framer.frame[0] == 0xA7u);
    for (size_t i = 1u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        assert(encoder_framer_push(&framer, p1_up_frame[i]) ==
               (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
    }
    assert(memcmp(framer.frame, p1_up_frame, RYCADE_ENCODER_FRAME_LENGTH) == 0);

    encoder_framer_reset(&framer);
    assert(!encoder_framer_push(&framer, 0xA7u));
    assert(!encoder_framer_push(&framer, 0x00u));
    assert(framer.length == 0u);
    for (size_t i = 0u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
        assert(encoder_framer_push(&framer, p2_up_frame[i]) ==
               (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
    }
    assert(memcmp(framer.frame, p2_up_frame, RYCADE_ENCODER_FRAME_LENGTH) == 0);

    encoder_framer_reset(&framer);
    for (size_t frame_index = 0u; frame_index < 2u; ++frame_index) {
        const uint8_t *frame = frame_index == 0u ? p1_up_frame : p2_up_frame;
        for (size_t i = 0u; i < RYCADE_ENCODER_FRAME_LENGTH; ++i) {
            const bool complete = encoder_framer_push(&framer, frame[i]);
            assert(complete == (i == RYCADE_ENCODER_FRAME_LENGTH - 1u));
        }
        assert(memcmp(framer.frame, frame, RYCADE_ENCODER_FRAME_LENGTH) == 0);
    }
}

static void test_gamepad_mapping(void)
{
    const uint8_t all_buttons = RYCADE_BUTTON_A | RYCADE_BUTTON_B | RYCADE_BUTTON_C |
                                RYCADE_BUTTON_X | RYCADE_BUTTON_Y | RYCADE_BUTTON_Z;
    const struct player_state states[RYCADE_PLAYER_COUNT] = {
        {RYCADE_DIR_LEFT | RYCADE_DIR_RIGHT | RYCADE_DIR_UP | RYCADE_DIR_DOWN |
             RYCADE_DIR_START, all_buttons},
        {RYCADE_DIR_RIGHT | RYCADE_DIR_UP | RYCADE_DIR_START, all_buttons},
        {RYCADE_DIR_DOWN | RYCADE_DIR_START, all_buttons},
        {RYCADE_DIR_LEFT | RYCADE_DIR_START, all_buttons}
    };
    struct gamepad_report report;

    player_states_to_report(states, &report);
    assert(sizeof(report) == 12u);
    assert(report.axes[0] == 0 && report.axes[1] == 0);
    assert(report.axes[2] == 127 && report.axes[3] == -127);
    assert(report.axes[4] == 0 && report.axes[5] == 127);
    assert(report.axes[6] == -127 && report.axes[7] == 0);
    assert(report.buttons[0] == 0xFFu);
    assert(report.buttons[1] == 0xFFu);
    assert(report.buttons[2] == 0xFFu);
    assert(report.buttons[3] == 0x0Fu);
}

int main(void)
{
    test_parser();
    test_framer();
    test_gamepad_mapping();
    puts("encoder and gamepad mapping tests passed");
    return 0;
}
