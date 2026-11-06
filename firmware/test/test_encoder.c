/* firmware/test/test_encoder.c */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>

#include "encoder.h"
#include "gamepad.h"

int main(void)
{
    const uint8_t frame[18] = {
        0xA7u, 0x10u, 0x00u, 0x00u,
        RYCADE_DIR_RIGHT | RYCADE_DIR_START, RYCADE_BUTTON_Y | RYCADE_BUTTON_A,
        0x00u, 0x00u,
        RYCADE_DIR_UP | RYCADE_DIR_LEFT, RYCADE_BUTTON_X | RYCADE_BUTTON_Z,
        0x00u, 0x00u,
        RYCADE_DIR_DOWN | RYCADE_DIR_RIGHT, RYCADE_BUTTON_B | RYCADE_BUTTON_C,
        0x00u, 0x00u,
        RYCADE_DIR_UP, 0x00u
    };
    struct player_state states[RYCADE_PLAYER_COUNT] = {{0u, 0u}};
    struct gamepad_report report = {0, 0, {0u, 0u}};
    uint8_t bad_header[18];

    assert(encoder_parse(frame, sizeof(frame), states));
    assert(states[0].dirs == (RYCADE_DIR_RIGHT | RYCADE_DIR_START));
    assert(states[0].buttons == (RYCADE_BUTTON_Y | RYCADE_BUTTON_A));
    assert(states[1].dirs == (RYCADE_DIR_UP | RYCADE_DIR_LEFT));
    assert(states[1].buttons == (RYCADE_BUTTON_X | RYCADE_BUTTON_Z));
    assert(states[2].dirs == (RYCADE_DIR_DOWN | RYCADE_DIR_RIGHT));
    assert(states[2].buttons == (RYCADE_BUTTON_B | RYCADE_BUTTON_C));
    assert(states[3].dirs == RYCADE_DIR_UP);
    assert(states[3].buttons == 0u);
    assert(!encoder_parse(frame, sizeof(frame) - 1u, states));
    assert(!encoder_parse(NULL, sizeof(frame), states));
    assert(!encoder_parse(frame, sizeof(frame), NULL));

    for (size_t i = 0u; i < sizeof(bad_header); ++i) {
        bad_header[i] = frame[i];
    }
    bad_header[0] = 0x00u;
    assert(!encoder_parse(bad_header, sizeof(bad_header), states));

    states[0].dirs = RYCADE_DIR_LEFT | RYCADE_DIR_RIGHT | RYCADE_DIR_UP | RYCADE_DIR_DOWN;
    player_state_to_report(&states[0], &report);
    assert(report.x == 0);
    assert(report.y == 0);

    states[0].dirs = RYCADE_DIR_LEFT | RYCADE_DIR_DOWN | RYCADE_DIR_START;
    states[0].buttons = RYCADE_BUTTON_A | RYCADE_BUTTON_B | RYCADE_BUTTON_C |
                        RYCADE_BUTTON_X | RYCADE_BUTTON_Y | RYCADE_BUTTON_Z;
    player_state_to_report(&states[0], &report);
    assert(report.x == -127);
    assert(report.y == 127);
    assert(report.buttons[0] == 0x7Fu);
    assert(report.buttons[1] == 0u);

    puts("encoder and gamepad mapping tests passed");
    return 0;
}
