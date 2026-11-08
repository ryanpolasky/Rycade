#include "cabinet.h"

#include "encoder.h"

void cabinet_volume_reset(struct cabinet_volume *volume)
{
    if (volume != NULL) {
        volume->press_started_ms = 0u;
        volume->direction = 0u;
    }
}

uint8_t cabinet_volume_update(struct cabinet_volume *volume, uint8_t cabinet_bits,
                              uint32_t now_ms)
{
    const uint8_t requested = cabinet_bits & (RYCADE_CAB_VOL_UP | RYCADE_CAB_VOL_DOWN);
    const uint8_t direction =
        requested == RYCADE_CAB_VOL_UP || requested == RYCADE_CAB_VOL_DOWN ? requested : 0u;

    if (volume == NULL) {
        return 0u;
    }
    if (direction != volume->direction) {
        volume->direction = direction;
        volume->press_started_ms = now_ms;
    }
    if (direction == 0u) {
        return 0u;
    }

    const uint32_t elapsed_ms = now_ms - volume->press_started_ms;
    if (elapsed_ms < 30u) {
        return direction == RYCADE_CAB_VOL_UP ? 1u : 2u;
    }
    if (elapsed_ms < 400u) {
        return 0u;
    }
    return (elapsed_ms - 400u) % 120u < 30u
               ? (direction == RYCADE_CAB_VOL_UP ? 1u : 2u)
               : 0u;
}

void cabinet_keys(uint8_t cabinet_bits, uint8_t keys_out[3])
{
    if (keys_out == NULL) {
        return;
    }

    keys_out[0] = (cabinet_bits & RYCADE_CAB_POWER_ON) != 0u ? 0x6Cu : 0u;
    keys_out[1] = (cabinet_bits & RYCADE_CAB_POWER_OFF) != 0u ? 0x6Du : 0u;
    keys_out[2] = (cabinet_bits & RYCADE_CAB_LIVE) != 0u ? 0x6Eu : 0u;
}
