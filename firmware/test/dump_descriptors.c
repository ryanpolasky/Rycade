/* firmware/test/dump_descriptors.c */
#include <stdio.h>

#include "usb_descriptors.h"

int main(void)
{
    printf("configuration (%u bytes):", RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH);
    for (size_t i = 0u; i < RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH; ++i) {
        printf(" %02X", rycade_configuration_descriptor[i]);
    }
    printf("\ninterfaces=%u endpoints:", rycade_configuration_descriptor[4]);

    for (size_t offset = 0u; offset < RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH;) {
        const uint8_t length = rycade_configuration_descriptor[offset];
        if (length < 2u) {
            return 1;
        }
        if (rycade_configuration_descriptor[offset + 1u] == 0x05u) {
            printf(" %02X", rycade_configuration_descriptor[offset + 2u]);
        }
        offset += length;
    }

    printf("\nHID report (%zu bytes):", rycade_hid_report_descriptor_length);
    for (size_t i = 0u; i < rycade_hid_report_descriptor_length; ++i) {
        printf(" %02X", rycade_hid_report_descriptor[i]);
    }
    putchar('\n');
    return 0;
}
