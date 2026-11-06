/* firmware/src/sniff_logic.h */
#ifndef RYCADE_SNIFF_LOGIC_H
#define RYCADE_SNIFF_LOGIC_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define SNIFF_CHANNEL_COUNT 8u
#define SNIFF_FRAME_MAX_BYTES 128u
#define SNIFF_COMMAND_MAX_LENGTH 96u

struct sniff_channel_map {
    uint8_t hole;
    uint8_t gpio;
};

extern const struct sniff_channel_map sniff_channel_map[SNIFF_CHANNEL_COUNT];

int sniff_hole_index(uint8_t hole);

struct sniff_stats {
    uint32_t edges[SNIFF_CHANNEL_COUNT];
    uint32_t min_high_us[SNIFF_CHANNEL_COUNT];
    uint32_t min_low_us[SNIFF_CHANNEL_COUNT];
    uint32_t last_transition_us[SNIFF_CHANNEL_COUNT];
    uint8_t levels;
    bool initialized;
};

void sniff_stats_init(struct sniff_stats *stats, uint8_t levels, uint32_t now_us);
void sniff_stats_sample(struct sniff_stats *stats, uint8_t levels, uint32_t now_us);
void sniff_stats_reset_interval(struct sniff_stats *stats);

struct sniff_frame_state {
    uint8_t hole;
    uint32_t baud;
    uint32_t last_byte_us;
    uint16_t length;
    uint8_t bytes[SNIFF_FRAME_MAX_BYTES];
};

struct sniff_frame {
    uint8_t hole;
    uint16_t length;
    uint8_t bytes[SNIFF_FRAME_MAX_BYTES];
};

bool sniff_frame_feed(struct sniff_frame_state *state, uint8_t hole, uint32_t baud,
                      uint8_t byte, uint32_t now_us, struct sniff_frame *completed);
bool sniff_frame_expire(struct sniff_frame_state *state, uint32_t now_us,
                        struct sniff_frame *completed);

enum sniff_command_type {
    SNIFF_COMMAND_INVALID = 0,
    SNIFF_COMMAND_PULL,
    SNIFF_COMMAND_UART_START,
    SNIFF_COMMAND_UART_OFF,
    SNIFF_COMMAND_INVERT,
    SNIFF_COMMAND_HELP
};

enum sniff_pull_mode {
    SNIFF_PULL_NONE = 0,
    SNIFF_PULL_UP,
    SNIFF_PULL_DOWN
};

struct sniff_command {
    enum sniff_command_type type;
    enum sniff_pull_mode pull;
    uint8_t hole;
    uint32_t baud;
    bool enabled;
};

bool sniff_command_parse(const char *line, struct sniff_command *command);

#endif
