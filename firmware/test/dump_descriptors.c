/* firmware/test/dump_descriptors.c */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "usb_descriptors.h"

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
#define ACTIVE_CONFIGURATION rycade_debug_configuration_descriptor
#define ACTIVE_CONFIGURATION_LENGTH RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH
#define EXPECTED_INTERFACE_COUNT (RYCADE_HID_INTERFACE_COUNT + 2u)
#define EXPECTED_PRODUCT_ID 0x4007u
#define EXPECTED_ENDPOINT_COUNT 5u
static const uint8_t expected_endpoints[] = {0x81u, 0x82u, 0x83u, 0x04u, 0x84u};
#else
#define ACTIVE_CONFIGURATION rycade_configuration_descriptor
#define ACTIVE_CONFIGURATION_LENGTH RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH
#define EXPECTED_INTERFACE_COUNT RYCADE_HID_INTERFACE_COUNT
#define EXPECTED_PRODUCT_ID 0x4006u
#define EXPECTED_ENDPOINT_COUNT 2u
static const uint8_t expected_endpoints[] = {0x81u, 0x82u};
#endif

static const uint8_t expected_players_report_descriptor[] = {
    0x05u, 0x01u, 0x09u, 0x05u, 0xA1u, 0x01u,
    0x05u, 0x01u, 0x09u, 0x30u, 0x09u, 0x31u, 0x09u, 0x32u, 0x09u, 0x33u,
    0x09u, 0x34u, 0x09u, 0x35u, 0x09u, 0x36u, 0x09u, 0x37u,
    0x15u, 0x81u, 0x25u, 0x7Fu, 0x75u, 0x08u, 0x95u, 0x08u, 0x81u, 0x02u,
    0x05u, 0x09u, 0x19u, 0x01u, 0x29u, 0x1Cu, 0x15u, 0x00u, 0x25u, 0x01u,
    0x75u, 0x01u, 0x95u, 0x1Cu, 0x81u, 0x02u,
    0x75u, 0x01u, 0x95u, 0x04u, 0x81u, 0x03u, 0xC0u
};

static void assert_string(uint8_t index, const char *expected)
{
    const uint16_t *descriptor = tud_descriptor_string_cb(index, 0u);
    const size_t length = strlen(expected);

    assert(descriptor != NULL);
    assert(descriptor[0] == (uint16_t)(0x0300u | ((length + 1u) * 2u)));
    for (size_t i = 0u; i < length; ++i) {
        assert(descriptor[i + 1u] == (uint8_t)expected[i]);
    }
}

int main(void)
{
    const size_t descriptor_length = sizeof(ACTIVE_CONFIGURATION);
    const uint16_t total_length =
        (uint16_t)ACTIVE_CONFIGURATION[2] |
        (uint16_t)((uint16_t)ACTIVE_CONFIGURATION[3] << 8u);
    const uint16_t product_id =
        (uint16_t)rycade_device_descriptor[10] |
        (uint16_t)((uint16_t)rycade_device_descriptor[11] << 8u);
    const uint16_t bcd_device =
        (uint16_t)rycade_device_descriptor[12] |
        (uint16_t)((uint16_t)rycade_device_descriptor[13] << 8u);
    bool seen_endpoints[256] = {false};
    bool seen_interfaces[EXPECTED_INTERFACE_COUNT] = {false};
    bool found_players = false;
    bool found_cabinet = false;
    size_t endpoint_count = 0u;
    size_t interface_count = 0u;
    uint8_t interface_number = UINT8_MAX;

    assert(descriptor_length == ACTIVE_CONFIGURATION_LENGTH);
    assert(total_length == descriptor_length);
    assert(ACTIVE_CONFIGURATION[4] == EXPECTED_INTERFACE_COUNT);
    assert(ACTIVE_CONFIGURATION[7] == 0xA0u);
    assert(rycade_device_descriptor[8] == 0xFEu);
    assert(rycade_device_descriptor[9] == 0xCAu);
    assert(product_id == EXPECTED_PRODUCT_ID);
    assert(bcd_device == 0x0200u);
    assert(tud_descriptor_configuration_cb(0u) == ACTIVE_CONFIGURATION);
    assert(tud_descriptor_configuration_cb(1u) == NULL);
    assert(tud_hid_descriptor_report_cb(RYCADE_PLAYERS_HID_INSTANCE) ==
           rycade_hid_report_descriptor);
    assert(tud_hid_descriptor_report_cb(RYCADE_CABINET_HID_INSTANCE) ==
           rycade_cabinet_report_descriptor);
    assert(tud_hid_descriptor_report_cb(2u) == NULL);
    assert(rycade_hid_report_descriptor_length == sizeof(expected_players_report_descriptor));
    assert(memcmp(rycade_hid_report_descriptor, expected_players_report_descriptor,
                  sizeof(expected_players_report_descriptor)) == 0);
    assert_string(4u, "Rycade Players");
    assert_string(5u, "Rycade Cabinet");
#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
    assert_string(6u, "Rycade Debug");
#endif

    printf("device PID=0x%04X attributes=0x%02X\n",
           (unsigned int)product_id,
           (unsigned int)ACTIVE_CONFIGURATION[7]);
    printf("configuration (%zu bytes):", descriptor_length);
    for (size_t i = 0u; i < descriptor_length; ++i) {
        printf(" %02X", ACTIVE_CONFIGURATION[i]);
    }
    printf("\ninterfaces=%u endpoints:", ACTIVE_CONFIGURATION[4]);

    for (size_t offset = 0u; offset < descriptor_length;) {
        const uint8_t length = ACTIVE_CONFIGURATION[offset];
        assert(length >= 2u);
        assert(offset + length <= descriptor_length);
        if (ACTIVE_CONFIGURATION[offset + 1u] == 0x04u) {
            assert(length >= 9u);
            interface_number = ACTIVE_CONFIGURATION[offset + 2u];
            assert(interface_number < EXPECTED_INTERFACE_COUNT);
            assert(!seen_interfaces[interface_number]);
            seen_interfaces[interface_number] = true;
            ++interface_count;
        } else if (ACTIVE_CONFIGURATION[offset + 1u] == 0x21u) {
            assert(length >= 9u);
            const uint16_t report_length =
                (uint16_t)ACTIVE_CONFIGURATION[offset + 7u] |
                (uint16_t)((uint16_t)ACTIVE_CONFIGURATION[offset + 8u] << 8u);
            if (interface_number == 0u) {
                assert(report_length == rycade_hid_report_descriptor_length);
                found_players = true;
            } else if (interface_number == 1u) {
                assert(report_length == rycade_cabinet_report_descriptor_length);
                found_cabinet = true;
            } else {
                assert(false);
            }
        } else if (ACTIVE_CONFIGURATION[offset + 1u] == 0x05u) {
            assert(length >= 7u);
            const uint8_t endpoint = ACTIVE_CONFIGURATION[offset + 2u];
            printf(" %02X", endpoint);
            assert(!seen_endpoints[endpoint]);
            seen_endpoints[endpoint] = true;
            ++endpoint_count;
        }
        offset += length;
    }
    assert(interface_count == EXPECTED_INTERFACE_COUNT);
    assert(found_players && found_cabinet);
    assert(endpoint_count == EXPECTED_ENDPOINT_COUNT);
    for (size_t i = 0u; i < EXPECTED_ENDPOINT_COUNT; ++i) {
        assert(seen_endpoints[expected_endpoints[i]]);
    }

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
