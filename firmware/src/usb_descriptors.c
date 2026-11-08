/* firmware/src/usb_descriptors.c */
#include "usb_descriptors.h"

void pico_get_unique_board_id_string(char *id_out, unsigned int len);

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
const uint8_t rycade_device_descriptor[18] = {
    18u, 0x01u, 0x00u, 0x02u, 0xEFu, 0x02u, 0x01u, 64u,
    0xFEu, 0xCAu, 0x07u, 0x40u, 0x00u, 0x02u, 1u, 2u, 3u, 1u
};
#else
const uint8_t rycade_device_descriptor[18] = {
    18u, 0x01u, 0x00u, 0x02u, 0x00u, 0x00u, 0x00u, 64u,
    0xFEu, 0xCAu, 0x06u, 0x40u, 0x00u, 0x02u, 1u, 2u, 3u, 1u
};
#endif

const uint8_t rycade_hid_report_descriptor[] = {
    0x05u, 0x01u, 0x09u, 0x05u, 0xA1u, 0x01u,
    0x05u, 0x01u, 0x09u, 0x30u, 0x09u, 0x31u, 0x09u, 0x32u, 0x09u, 0x33u,
    0x09u, 0x34u, 0x09u, 0x35u, 0x09u, 0x36u, 0x09u, 0x37u,
    0x15u, 0x81u, 0x25u, 0x7Fu, 0x75u, 0x08u, 0x95u, 0x08u, 0x81u, 0x02u,
    0x05u, 0x09u, 0x19u, 0x01u, 0x29u, 0x1Cu, 0x15u, 0x00u, 0x25u, 0x01u,
    0x75u, 0x01u, 0x95u, 0x1Cu, 0x81u, 0x02u,
    0x75u, 0x01u, 0x95u, 0x04u, 0x81u, 0x03u, 0xC0u
};

const size_t rycade_hid_report_descriptor_length = sizeof(rycade_hid_report_descriptor);

const uint8_t rycade_cabinet_report_descriptor[] = {
    0x05u, 0x01u, 0x09u, 0x06u, 0xA1u, 0x01u, 0x85u, 0x01u,
    0x05u, 0x07u, 0x19u, 0x00u, 0x2Au, 0xFFu, 0x00u,
    0x15u, 0x00u, 0x26u, 0xFFu, 0x00u, 0x75u, 0x08u, 0x95u, 0x03u, 0x81u, 0x00u,
    0xC0u,
    0x05u, 0x0Cu, 0x09u, 0x01u, 0xA1u, 0x01u, 0x85u, 0x02u,
    0x15u, 0x00u, 0x25u, 0x01u, 0x09u, 0xE9u, 0x09u, 0xEAu,
    0x75u, 0x01u, 0x95u, 0x02u, 0x81u, 0x02u,
    0x75u, 0x06u, 0x95u, 0x01u, 0x81u, 0x01u,
    0xC0u
};

const size_t rycade_cabinet_report_descriptor_length =
    sizeof(rycade_cabinet_report_descriptor);

const uint8_t rycade_configuration_descriptor[RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH] = {
    9u, 0x02u,
    (uint8_t)(RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH & 0xFFu),
    (uint8_t)(RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH >> 8u),
    RYCADE_HID_INTERFACE_COUNT, 1u, 0u, 0xA0u, 50u,
    9u, 0x04u, 0u, 0u, 1u, 0x03u, 0u, 0u, 4u,
    9u, 0x21u, 0x11u, 0x01u, 0u, 1u, 0x22u, (uint8_t)sizeof(rycade_hid_report_descriptor), 0u,
    7u, 0x05u, 0x81u, 0x03u, 16u, 0u, 1u,
    9u, 0x04u, 1u, 0u, 1u, 0x03u, 0u, 0u, 5u,
    9u, 0x21u, 0x11u, 0x01u, 0u, 1u, 0x22u,
    (uint8_t)sizeof(rycade_cabinet_report_descriptor), 0u,
    7u, 0x05u, 0x82u, 0x03u, 16u, 0u, 1u
};

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
const uint8_t rycade_debug_configuration_descriptor[RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH] = {
    9u, 0x02u,
    (uint8_t)(RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH & 0xFFu),
    (uint8_t)(RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH >> 8u),
    (uint8_t)(RYCADE_HID_INTERFACE_COUNT + 2u), 1u, 0u, 0xA0u, 50u,
    9u, 0x04u, 0u, 0u, 1u, 0x03u, 0u, 0u, 4u,
    9u, 0x21u, 0x11u, 0x01u, 0u, 1u, 0x22u, (uint8_t)sizeof(rycade_hid_report_descriptor), 0u,
    7u, 0x05u, 0x81u, 0x03u, 16u, 0u, 1u,
    9u, 0x04u, 1u, 0u, 1u, 0x03u, 0u, 0u, 5u,
    9u, 0x21u, 0x11u, 0x01u, 0u, 1u, 0x22u,
    (uint8_t)sizeof(rycade_cabinet_report_descriptor), 0u,
    7u, 0x05u, 0x82u, 0x03u, 16u, 0u, 1u,
    TUD_CDC_DESCRIPTOR(RYCADE_HID_INTERFACE_COUNT, 6u, 0x83u, 8u, 0x04u, 0x84u, 64u)
};
#endif

uint8_t const *tud_descriptor_device_cb(void)
{
    return rycade_device_descriptor;
}

uint8_t const *tud_descriptor_configuration_cb(uint8_t index)
{
#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
    return index == 0u ? rycade_debug_configuration_descriptor : NULL;
#else
    return index == 0u ? rycade_configuration_descriptor : NULL;
#endif
}

uint8_t const *tud_hid_descriptor_report_cb(uint8_t instance)
{
    if (instance == RYCADE_PLAYERS_HID_INSTANCE) {
        return rycade_hid_report_descriptor;
    }
    return instance == RYCADE_CABINET_HID_INSTANCE ? rycade_cabinet_report_descriptor : NULL;
}

uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid)
{
    static uint16_t descriptor[32];
    char serial[17];
    const char *value = NULL;
    size_t length = 0u;

    (void)langid;

    if (index == 0u) {
        descriptor[0] = 0x0304u;
        descriptor[1] = 0x0409u;
        return descriptor;
    }
    if (index == 1u) {
        value = "Rycade";
    } else if (index == 2u) {
        value = "Rycade Controls";
    } else if (index == 3u) {
        pico_get_unique_board_id_string(serial, sizeof(serial));
        value = serial;
    } else if (index == 4u) {
        value = "Rycade Players";
    } else if (index == 5u) {
        value = "Rycade Cabinet";
#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
    } else if (index == 6u) {
        value = "Rycade Debug";
#endif
    }

    if (value == NULL) {
        return NULL;
    }

    while (value[length] != '\0' && length < 31u) {
        descriptor[length + 1u] = (uint8_t)value[length];
        ++length;
    }
    descriptor[0] = (uint16_t)(0x0300u | ((length + 1u) * 2u));
    return descriptor;
}
