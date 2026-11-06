/* firmware/src/gamepad.h */
#ifndef RYCADE_GAMEPAD_H
#define RYCADE_GAMEPAD_H

#include <stdint.h>

#include "encoder.h"

struct gamepad_report {
    int8_t x;
    int8_t y;
    uint8_t buttons[2];
};

void player_state_to_report(const struct player_state *state, struct gamepad_report *report);

#endif
