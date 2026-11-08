/* firmware/src/encoder.c */
#include "encoder.h"

#include <string.h>

bool encoder_parse(const uint8_t *buf, size_t len, uint8_t link,
                   struct player_state states[RYCADE_PLAYER_COUNT])
{
    if (buf == NULL || states == NULL || len != RYCADE_ENCODER_FRAME_LENGTH ||
        buf[0] != 0xA7u || buf[1] != 0x10u || link >= RYCADE_LINK_COUNT) {
        return false;
    }

    const size_t player_offset = (size_t)link * 2u;
    const struct player_state parsed[2] = {
        {buf[0x04u], buf[0x05u]},
        {buf[0x08u], buf[0x09u]}
    };

    memcpy(&states[player_offset], parsed, sizeof(parsed));
    return true;
}

void encoder_framer_reset(struct encoder_framer *f)
{
    if (f != NULL) {
        f->length = 0u;
    }
}

bool encoder_framer_push(struct encoder_framer *f, uint8_t byte)
{
    if (f == NULL) {
        return false;
    }

    if (f->length == 0u) {
        if (byte == 0xA7u) {
            f->frame[0] = byte;
            f->length = 1u;
        }
        return false;
    }

    if (f->length == 1u && byte != 0x10u) {
        f->length = byte == 0xA7u ? 1u : 0u;
        if (f->length != 0u) {
            f->frame[0] = byte;
        }
        return false;
    }

    f->frame[f->length++] = byte;
    if (f->length == RYCADE_ENCODER_FRAME_LENGTH) {
        f->length = 0u;
        return true;
    }

    return false;
}
