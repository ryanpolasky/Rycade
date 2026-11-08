#include <assert.h>
#include <stdint.h>
#include <stdio.h>

#include "cabinet.h"
#include "encoder.h"

static void test_volume_repeat(void)
{
    struct cabinet_volume volume;

    cabinet_volume_reset(&volume);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1000u) == 1u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1029u) == 1u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1030u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1399u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1400u) == 1u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1429u) == 1u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1430u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1519u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1520u) == 1u);

    assert(cabinet_volume_update(&volume, 0u, 1521u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP, 1600u) == 1u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_DOWN, 1610u) == 2u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_DOWN, 2009u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_DOWN, 2010u) == 2u);

    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_UP | RYCADE_CAB_VOL_DOWN,
                                 2020u) == 0u);
    assert(cabinet_volume_update(&volume, RYCADE_CAB_VOL_DOWN, 2021u) == 2u);
}

static void test_keys(void)
{
    uint8_t keys[3] = {0u, 0u, 0u};

    cabinet_keys(RYCADE_CAB_POWER_ON | RYCADE_CAB_LIVE, keys);
    assert(keys[0] == 0x6Cu);
    assert(keys[1] == 0u);
    assert(keys[2] == 0x6Eu);

    cabinet_keys(RYCADE_CAB_POWER_OFF, keys);
    assert(keys[0] == 0u);
    assert(keys[1] == 0x6Du);
    assert(keys[2] == 0u);
}

int main(void)
{
    test_volume_repeat();
    test_keys();
    puts("cabinet control tests passed");
    return 0;
}
