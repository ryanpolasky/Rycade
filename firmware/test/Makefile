CC ?= gcc
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic
ROOT := ..

.PHONY: all test clean

all: test

test: test_encoder test_sniff_logic dump_descriptors
	./test_encoder
	./test_sniff_logic
	./dump_descriptors

test_encoder: test_encoder.c $(ROOT)/src/encoder.c $(ROOT)/src/gamepad.c $(ROOT)/src/encoder.h $(ROOT)/src/gamepad.h
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ test_encoder.c $(ROOT)/src/encoder.c $(ROOT)/src/gamepad.c

test_sniff_logic: test_sniff_logic.c $(ROOT)/src/sniff_logic.c
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ $^

dump_descriptors: dump_descriptors.c unique_id_stub.c $(ROOT)/src/usb_descriptors.c
	$(CC) $(CFLAGS) -I$(ROOT)/src -o $@ $^

clean:
	rm -f test_encoder test_sniff_logic dump_descriptors
