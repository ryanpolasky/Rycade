/* firmware/test/unique_id_stub.c */
#include <stddef.h>

void pico_get_unique_board_id_string(char *id_out, unsigned int len)
{
    static const char serial[] = "0011223344556677";
    size_t i = 0u;

    if (id_out == NULL || len == 0u) {
        return;
    }
    while (i + 1u < len && serial[i] != '\0') {
        id_out[i] = serial[i];
        ++i;
    }
    id_out[i] = '\0';
}
