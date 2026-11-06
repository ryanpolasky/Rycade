/* firmware/src/sniff_usb_descriptors.c */
#include <string.h>

#include "pico/unique_id.h"
#include "tusb.h"

tusb_desc_device_t const sniff_device_descriptor = {
    .bLength = sizeof(tusb_desc_device_t),
    .bDescriptorType = TUSB_DESC_DEVICE,
    .bcdUSB = 0x0200,
    .bDeviceClass = TUSB_CLASS_MISC,
    .bDeviceSubClass = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol = MISC_PROTOCOL_IAD,
    .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor = 0xCAFE,
    .idProduct = 0x4005,
    .bcdDevice = 0x0100,
    .iManufacturer = 1,
    .iProduct = 2,
    .iSerialNumber = 3,
    .bNumConfigurations = 1
};

enum {
    SNIFF_ITF_CDC = 0,
    SNIFF_ITF_CDC_DATA,
    SNIFF_ITF_TOTAL
};

#define SNIFF_CONFIG_TOTAL_LENGTH (TUD_CONFIG_DESC_LEN + TUD_CDC_DESC_LEN)

uint8_t const sniff_configuration_descriptor[] = {
    TUD_CONFIG_DESCRIPTOR(1, SNIFF_ITF_TOTAL, 0, SNIFF_CONFIG_TOTAL_LENGTH,
                          TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 100),
    TUD_CDC_DESCRIPTOR(SNIFF_ITF_CDC, 4, 0x81, 8, 0x02, 0x82, 64)
};

uint8_t const *tud_descriptor_device_cb(void)
{
    return (uint8_t const *)&sniff_device_descriptor;
}

uint8_t const *tud_descriptor_configuration_cb(uint8_t index)
{
    return index == 0u ? sniff_configuration_descriptor : NULL;
}

uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid)
{
    static uint16_t descriptor[32];
    char serial[2u * PICO_UNIQUE_BOARD_ID_SIZE_BYTES + 1u];
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
    } else if (index == 2u || index == 4u) {
        value = "Rycade Sniffer";
    } else if (index == 3u) {
        pico_get_unique_board_id_string(serial, sizeof(serial));
        value = serial;
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
