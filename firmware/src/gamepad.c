/* firmware/src/gamepad.c */
#include "gamepad.h"

void player_state_to_report(const struct player_state *state, struct gamepad_report *report)
{
    const bool right = (state->dirs & RYCADE_DIR_RIGHT) != 0u;
    const bool down = (state->dirs & RYCADE_DIR_DOWN) != 0u;
    const bool left = (state->dirs & RYCADE_DIR_LEFT) != 0u;
    const bool up = (state->dirs & RYCADE_DIR_UP) != 0u;
    uint16_t buttons = 0u;

    report->x = left == right ? 0 : (left ? -127 : 127);
    report->y = up == down ? 0 : (up ? -127 : 127);

    if ((state->buttons & RYCADE_BUTTON_A) != 0u) {
        buttons |= 1u << 0;
    }
    if ((state->buttons & RYCADE_BUTTON_B) != 0u) {
        buttons |= 1u << 1;
    }
    if ((state->buttons & RYCADE_BUTTON_C) != 0u) {
        buttons |= 1u << 2;
    }
    if ((state->buttons & RYCADE_BUTTON_X) != 0u) {
        buttons |= 1u << 3;
    }
    if ((state->buttons & RYCADE_BUTTON_Y) != 0u) {
        buttons |= 1u << 4;
    }
    if ((state->buttons & RYCADE_BUTTON_Z) != 0u) {
        buttons |= 1u << 5;
    }
    if ((state->dirs & RYCADE_DIR_START) != 0u) {
        buttons |= 1u << 6;
    }

    report->buttons[0] = (uint8_t)(buttons & 0xFFu);
    report->buttons[1] = (uint8_t)(buttons >> 8);
}
