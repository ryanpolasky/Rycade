cmake_minimum_required(VERSION 3.13)

include(pico_sdk_import.cmake)

project(rycade_pico C CXX ASM)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(RYCADE_MODE "demo" CACHE STRING "Firmware mode: demo, encoder or sniff")
set_property(CACHE RYCADE_MODE PROPERTY STRINGS demo encoder sniff)

if(NOT RYCADE_MODE STREQUAL "demo" AND NOT RYCADE_MODE STREQUAL "encoder" AND
   NOT RYCADE_MODE STREQUAL "sniff")
    message(FATAL_ERROR "RYCADE_MODE must be demo, encoder or sniff")
endif()

pico_sdk_init()

if(RYCADE_MODE STREQUAL "sniff")
    add_executable(rycade_pico
        src/sniff_main.c
        src/sniff_logic.c
        src/sniff_usb_descriptors.c
    )
else()
    add_executable(rycade_pico
        src/main.c
        src/encoder.c
        src/gamepad.c
        src/usb_descriptors.c
    )
endif()

target_include_directories(rycade_pico PRIVATE src)
target_compile_options(rycade_pico PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(rycade_pico PRIVATE PICO_CXX_DISABLE_ALLOCATION_OVERRIDES=1)
target_link_libraries(rycade_pico PRIVATE pico_stdlib pico_unique_id tinyusb_device)
set_property(TARGET rycade_pico PROPERTY LINKER_LANGUAGE C)

if(RYCADE_MODE STREQUAL "encoder")
    target_compile_definitions(rycade_pico PRIVATE RYCADE_MODE_ENCODER=1)
    target_link_libraries(rycade_pico PRIVATE hardware_pio hardware_irq)
    pico_generate_pio_header(rycade_pico ${CMAKE_CURRENT_LIST_DIR}/src/uart_rx.pio)
    pico_generate_pio_header(rycade_pico ${CMAKE_CURRENT_LIST_DIR}/src/uart_tx.pio)
elseif(RYCADE_MODE STREQUAL "sniff")
    target_compile_definitions(rycade_pico PRIVATE RYCADE_MODE_ENCODER=0 RYCADE_MODE_SNIFF=1)
    target_link_libraries(rycade_pico PRIVATE hardware_pio pico_multicore)
    pico_generate_pio_header(rycade_pico ${CMAKE_CURRENT_LIST_DIR}/src/uart_rx.pio)
else()
    target_compile_definitions(rycade_pico PRIVATE RYCADE_MODE_ENCODER=0 RYCADE_MODE_SNIFF=0)
endif()

pico_enable_stdio_uart(rycade_pico 0)
pico_enable_stdio_usb(rycade_pico 0)
pico_add_extra_outputs(rycade_pico)
