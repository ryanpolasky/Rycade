/* firmware/src/gamepad.h */
#ifndef RYCADE_GAMEPAD_H
#define RYCADE_GAMEPAD_H

#include <stdint.h>

#include "encoder.h"

#define RYCADE_GAMEPAD_AXIS_COUNT (RYCADE_PLAYER_COUNT * 2u)
#define RYCADE_GAMEPAD_BUTTON_BYTE_COUNT 4u

struct gamepad_report {
    int8_t axes[RYCADE_GAMEPAD_AXIS_COUNT];
    uint8_t buttons[RYCADE_GAMEPAD_BUTTON_BYTE_COUNT];
};

void player_state_to_report(const struct player_state *state, uint8_t player,
                            struct gamepad_report *report);
void player_states_to_report(const struct player_state states[RYCADE_PLAYER_COUNT],
                             struct gamepad_report *report);

#endif
