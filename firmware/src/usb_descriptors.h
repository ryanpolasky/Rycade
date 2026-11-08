/* firmware/src/usb_descriptors.h */
#ifndef RYCADE_USB_DESCRIPTORS_H
#define RYCADE_USB_DESCRIPTORS_H

#include <stddef.h>
#include <stdint.h>

#define RYCADE_CONFIGURATION_HEADER_LENGTH 9u
#define RYCADE_HID_INTERFACE_DESCRIPTOR_LENGTH (9u + 9u + 7u)
#define RYCADE_HID_INTERFACE_COUNT 5u
#define RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH \
    (RYCADE_CONFIGURATION_HEADER_LENGTH + \
     RYCADE_HID_INTERFACE_COUNT * RYCADE_HID_INTERFACE_DESCRIPTOR_LENGTH)

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
#include "tusb.h"
#define RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH \
    (RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH + TUD_CDC_DESC_LEN)
extern const uint8_t rycade_debug_configuration_descriptor[RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH];
#endif

extern const uint8_t rycade_device_descriptor[18];
extern const uint8_t rycade_configuration_descriptor[RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH];
extern const uint8_t rycade_hid_report_descriptor[];
extern const size_t rycade_hid_report_descriptor_length;
extern const uint8_t rycade_cabinet_report_descriptor[];
extern const size_t rycade_cabinet_report_descriptor_length;

uint8_t const *tud_descriptor_device_cb(void);
uint8_t const *tud_descriptor_configuration_cb(uint8_t index);
uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid);
uint8_t const *tud_hid_descriptor_report_cb(uint8_t instance);

#endif
