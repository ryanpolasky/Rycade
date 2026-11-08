/* firmware/src/encoder.h */
#ifndef RYCADE_ENCODER_H
#define RYCADE_ENCODER_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define RYCADE_PLAYER_COUNT 4u
#define RYCADE_LINK_COUNT 2u
#define RYCADE_ENCODER_FRAME_LENGTH 18u

#define RYCADE_DIR_RIGHT (1u << 0)
#define RYCADE_DIR_DOWN (1u << 1)
#define RYCADE_DIR_LEFT (1u << 2)
#define RYCADE_DIR_UP (1u << 3)
#define RYCADE_DIR_START (1u << 5)

#define RYCADE_BUTTON_Y (1u << 0)
#define RYCADE_BUTTON_B (1u << 1)
#define RYCADE_BUTTON_C (1u << 2)
#define RYCADE_BUTTON_X (1u << 3)
#define RYCADE_BUTTON_A (1u << 4)
#define RYCADE_BUTTON_Z (1u << 5)

struct player_state {
    uint8_t dirs;
    uint8_t buttons;
};

struct encoder_framer {
    uint8_t frame[RYCADE_ENCODER_FRAME_LENGTH];
    uint8_t length;
};

bool encoder_parse(const uint8_t *buf, size_t len, uint8_t link,
                   struct player_state states[RYCADE_PLAYER_COUNT]);
void encoder_framer_reset(struct encoder_framer *f);
bool encoder_framer_push(struct encoder_framer *f, uint8_t byte);

#endif
