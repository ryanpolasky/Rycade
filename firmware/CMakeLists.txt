cmake_minimum_required(VERSION 3.13)

include(pico_sdk_import.cmake)

project(rycade_pico C CXX ASM)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(RYCADE_MODE "demo" CACHE STRING "Firmware mode: demo or encoder")
set_property(CACHE RYCADE_MODE PROPERTY STRINGS demo encoder)

if(NOT RYCADE_MODE STREQUAL "demo" AND NOT RYCADE_MODE STREQUAL "encoder")
    message(FATAL_ERROR "RYCADE_MODE must be demo or encoder")
endif()

pico_sdk_init()

add_executable(rycade_pico
    src/main.c
    src/encoder.c
    src/gamepad.c
    src/usb_descriptors.c
)

target_include_directories(rycade_pico PRIVATE src)
target_compile_options(rycade_pico PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(rycade_pico PRIVATE PICO_CXX_DISABLE_ALLOCATION_OVERRIDES=1)
target_link_libraries(rycade_pico PRIVATE pico_stdlib pico_unique_id tinyusb_device)
set_property(TARGET rycade_pico PROPERTY LINKER_LANGUAGE C)

if(RYCADE_MODE STREQUAL "encoder")
    target_compile_definitions(rycade_pico PRIVATE RYCADE_MODE_ENCODER=1)
    target_link_libraries(rycade_pico PRIVATE hardware_uart)
else()
    target_compile_definitions(rycade_pico PRIVATE RYCADE_MODE_ENCODER=0)
endif()

pico_enable_stdio_uart(rycade_pico 0)
pico_enable_stdio_usb(rycade_pico 0)
pico_add_extra_outputs(rycade_pico)
