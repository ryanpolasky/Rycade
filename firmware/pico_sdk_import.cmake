if(NOT PICO_SDK_PATH)
    set(PICO_SDK_PATH "$ENV{PICO_SDK_PATH}")
endif()

include("${PICO_SDK_PATH}/external/pico_sdk_import.cmake")
