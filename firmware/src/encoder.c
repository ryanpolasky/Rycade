/* firmware/src/encoder.c */
#include "encoder.h"

#include <string.h>

bool encoder_parse(const uint8_t *buf, size_t len, struct player_state out[RYCADE_PLAYER_COUNT])
{
    static const size_t dir_offsets[RYCADE_PLAYER_COUNT] = {0x04u, 0x08u, 0x0Cu, 0x10u};
    struct player_state parsed[RYCADE_PLAYER_COUNT];

    if (buf == NULL || out == NULL || len != 18u || buf[0] != 0xA7u || buf[1] != 0x10u) {
        return false;
    }

    for (size_t player = 0; player < RYCADE_PLAYER_COUNT; ++player) {
        parsed[player].dirs = buf[dir_offsets[player]];
        parsed[player].buttons = buf[dir_offsets[player] + 1u];
    }

    memcpy(out, parsed, sizeof(parsed));
    return true;
}
