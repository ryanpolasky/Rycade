/* firmware/src/gamepad.c */
#include "gamepad.h"

#include <string.h>

static const uint8_t button_masks[] = {
    RYCADE_BUTTON_A,
    RYCADE_BUTTON_B,
    RYCADE_BUTTON_C,
    RYCADE_BUTTON_X,
    RYCADE_BUTTON_Y,
    RYCADE_BUTTON_Z
};

_Static_assert(sizeof(struct gamepad_report) == 12u, "combined gamepad report must be 12 bytes");

void player_state_to_report(const struct player_state *state, uint8_t player,
                            struct gamepad_report *report)
{
    if (state == NULL || player >= RYCADE_PLAYER_COUNT || report == NULL) {
        return;
    }

    const bool right = (state->dirs & RYCADE_DIR_RIGHT) != 0u;
    const bool down = (state->dirs & RYCADE_DIR_DOWN) != 0u;
    const bool left = (state->dirs & RYCADE_DIR_LEFT) != 0u;
    const bool up = (state->dirs & RYCADE_DIR_UP) != 0u;
    const uint8_t button_offset = (uint8_t)(player * 7u);

    report->axes[player * 2u] = left == right ? 0 : (left ? -127 : 127);
    report->axes[player * 2u + 1u] = up == down ? 0 : (up ? -127 : 127);

    for (uint8_t button = 0u; button < sizeof(button_masks) / sizeof(button_masks[0]); ++button) {
        if ((state->buttons & button_masks[button]) != 0u) {
            const uint8_t bit = (uint8_t)(button_offset + button);
            report->buttons[bit / 8u] |= (uint8_t)(1u << (bit % 8u));
        }
    }

    if ((state->dirs & RYCADE_DIR_START) != 0u) {
        const uint8_t bit = (uint8_t)(button_offset + 6u);
        report->buttons[bit / 8u] |= (uint8_t)(1u << (bit % 8u));
    }
}

void player_states_to_report(const struct player_state states[RYCADE_PLAYER_COUNT],
                             struct gamepad_report *report)
{
    if (states == NULL || report == NULL) {
        return;
    }

    memset(report, 0, sizeof(*report));
    for (uint8_t player = 0u; player < RYCADE_PLAYER_COUNT; ++player) {
        player_state_to_report(&states[player], player, report);
    }
}
