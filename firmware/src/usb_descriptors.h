/* firmware/src/usb_descriptors.h */
#ifndef RYCADE_USB_DESCRIPTORS_H
#define RYCADE_USB_DESCRIPTORS_H

#include <stddef.h>
#include <stdint.h>

#define RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH 109u

#if defined(RYCADE_ENCODER_DEBUG) && RYCADE_ENCODER_DEBUG
#include "tusb.h"
#define RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH (9u + 4u * 25u + TUD_CDC_DESC_LEN)
extern const uint8_t rycade_debug_configuration_descriptor[RYCADE_DEBUG_CONFIGURATION_DESCRIPTOR_LENGTH];
#endif

extern const uint8_t rycade_device_descriptor[18];
extern const uint8_t rycade_configuration_descriptor[RYCADE_CONFIGURATION_DESCRIPTOR_LENGTH];
extern const uint8_t rycade_hid_report_descriptor[];
extern const size_t rycade_hid_report_descriptor_length;

uint8_t const *tud_descriptor_device_cb(void);
uint8_t const *tud_descriptor_configuration_cb(uint8_t index);
uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid);
uint8_t const *tud_hid_descriptor_report_cb(uint8_t instance);

#endif
