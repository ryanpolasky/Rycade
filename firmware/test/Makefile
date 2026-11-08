CC ?= gcc
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic
ROOT := ..
PICO_SDK_PATH ?= $(HOME)/pico-sdk
TINYUSB_INCLUDE := -I$(PICO_SDK_PATH)/lib/tinyusb/src

.PHONY: all test clean

all: test

test: test_encoder test_cabinet test_sniff_logic dump_descriptors dump_descriptors_debug
	./test_encoder
	./test_cabinet
	./test_sniff_logic
	./dump_descriptors
	./dump_descriptors_debug

test_encoder: test_encoder.c $(ROOT)/src/encoder.c $(ROOT)/src/gamepad.c $(ROOT)/src/encoder.h $(ROOT)/src/gamepad.h
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ test_encoder.c $(ROOT)/src/encoder.c $(ROOT)/src/gamepad.c

test_cabinet: test_cabinet.c $(ROOT)/src/cabinet.c $(ROOT)/src/cabinet.h $(ROOT)/src/encoder.h
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ test_cabinet.c $(ROOT)/src/cabinet.c

test_sniff_logic: test_sniff_logic.c $(ROOT)/src/sniff_logic.c
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ $^

dump_descriptors: dump_descriptors.c unique_id_stub.c $(ROOT)/src/usb_descriptors.c
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ $^

dump_descriptors_debug: dump_descriptors.c unique_id_stub.c $(ROOT)/src/usb_descriptors.c
	$(CC) $(CFLAGS) -Wno-pedantic -DTUP_DCD_ENDPOINT_MAX=8 -DRYCADE_ENCODER_DEBUG=1 \
		-I$(ROOT)/src $(TINYUSB_INCLUDE) -o $@ $^

clean:
	rm -f test_encoder test_cabinet test_sniff_logic dump_descriptors dump_descriptors_debug
