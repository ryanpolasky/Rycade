/* firmware/test/dump_descriptors.c */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#include "usb_descriptors.h"

int main(void)
{
    const size_t descriptor_length = sizeof(rycade_configuration_descriptor);
    const uint16_t total_length =
        (uint16_t)rycade_configuration_descriptor[2] |
        (uint16_t)((uint16_t)rycade_configuration_descriptor[3] << 8u);
    const uint16_t product_id =
        (uint16_t)rycade_device_descriptor[10] |
        (uint16_t)((uint16_t)rycade_device_descriptor[11] << 8u);
    bool cabinet_endpoint_found = false;
    size_t endpoint_count = 0u;
    uint8_t interface_number = UINT8_MAX;

    assert(descriptor_length == RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH);
    assert(total_length == descriptor_length);
    assert(rycade_configuration_descriptor[4] == 5u);
    assert(rycade_configuration_descriptor[7] == 0xA0u);
    assert(product_id == 0x4006u);

    printf("device PID=0x%04X attributes=0x%02X\n",
           (unsigned int)product_id,
           (unsigned int)rycade_configuration_descriptor[7]);
    printf("configuration (%zu bytes):", descriptor_length);
    for (size_t i = 0u; i < descriptor_length; ++i) {
        printf(" %02X", rycade_configuration_descriptor[i]);
    }
    printf("\ninterfaces=%u endpoints:", rycade_configuration_descriptor[4]);

    for (size_t offset = 0u; offset < descriptor_length;) {
        const uint8_t length = rycade_configuration_descriptor[offset];
        assert(length >= 2u);
        assert(offset + length <= descriptor_length);
        if (rycade_configuration_descriptor[offset + 1u] == 0x04u) {
            assert(length >= 9u);
            interface_number = rycade_configuration_descriptor[offset + 2u];
        } else if (rycade_configuration_descriptor[offset + 1u] == 0x21u) {
            assert(length >= 9u);
            const uint16_t report_length =
                (uint16_t)rycade_configuration_descriptor[offset + 7u] |
                (uint16_t)((uint16_t)rycade_configuration_descriptor[offset + 8u] << 8u);
            if (interface_number < 4u) {
                assert(report_length == rycade_hid_report_descriptor_length);
            } else {
                assert(interface_number == 4u);
                assert(report_length == rycade_cabinet_report_descriptor_length);
            }
        } else if (rycade_configuration_descriptor[offset + 1u] == 0x05u) {
            assert(length >= 7u);
            const uint8_t endpoint = rycade_configuration_descriptor[offset + 2u];
            printf(" %02X", endpoint);
            ++endpoint_count;
            if (endpoint == 0x85u) {
                cabinet_endpoint_found = true;
            }
        }
        offset += length;
    }
    assert(endpoint_count == 5u);
    assert(cabinet_endpoint_found);

    printf("\nHID report (%zu bytes):", rycade_hid_report_descriptor_length);
    for (size_t i = 0u; i < rycade_hid_report_descriptor_length; ++i) {
        printf(" %02X", rycade_hid_report_descriptor[i]);
    }
    putchar('\n');
    printf("Cabinet HID report (%zu bytes):", rycade_cabinet_report_descriptor_length);
    for (size_t i = 0u; i < rycade_cabinet_report_descriptor_length; ++i) {
        printf(" %02X", rycade_cabinet_report_descriptor[i]);
    }
    putchar('\n');
    return 0;
}
