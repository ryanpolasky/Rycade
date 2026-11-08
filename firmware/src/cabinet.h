#ifndef RYCADE_CABINET_H
#define RYCADE_CABINET_H

#include <stdint.h>

struct cabinet_volume {
    uint32_t press_started_ms;
    uint8_t direction;
};

void cabinet_volume_reset(struct cabinet_volume *volume);
uint8_t cabinet_volume_update(struct cabinet_volume *volume, uint8_t cabinet_bits,
                              uint32_t now_ms);
void cabinet_keys(uint8_t cabinet_bits, uint8_t keys_out[3]);

#endif
