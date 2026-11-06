/* firmware/src/sniff_logic.c */
#include "sniff_logic.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

const struct sniff_channel_map sniff_channel_map[SNIFF_CHANNEL_COUNT] = {
    {1u, 2u}, {2u, 3u}, {4u, 4u}, {6u, 5u},
    {8u, 6u}, {10u, 7u}, {11u, 8u}, {12u, 9u}
};

static const uint32_t no_pulse = UINT32_MAX;

int sniff_hole_index(uint8_t hole)
{
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        if (sniff_channel_map[index].hole == hole) {
            return (int)index;
        }
    }
    return -1;
}

void sniff_stats_init(struct sniff_stats *stats, uint8_t levels, uint32_t now_us)
{
    memset(stats, 0, sizeof(*stats));
    stats->levels = levels;
    stats->initialized = true;
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        stats->last_transition_us[index] = now_us;
        stats->min_high_us[index] = no_pulse;
        stats->min_low_us[index] = no_pulse;
    }
}

void sniff_stats_sample(struct sniff_stats *stats, uint8_t levels, uint32_t now_us)
{
    if (!stats->initialized) {
        sniff_stats_init(stats, levels, now_us);
        return;
    }

    const uint8_t changed = stats->levels ^ levels;
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        const uint8_t bit = (uint8_t)(1u << index);
        if ((changed & bit) != 0u) {
            const uint32_t pulse_us = now_us - stats->last_transition_us[index];
            if ((stats->levels & bit) != 0u) {
                if (pulse_us < stats->min_high_us[index]) {
                    stats->min_high_us[index] = pulse_us;
                }
            } else if (pulse_us < stats->min_low_us[index]) {
                stats->min_low_us[index] = pulse_us;
            }
            ++stats->edges[index];
            stats->last_transition_us[index] = now_us;
        }
    }
    stats->levels = levels;
}

void sniff_stats_reset_interval(struct sniff_stats *stats)
{
    for (size_t index = 0u; index < SNIFF_CHANNEL_COUNT; ++index) {
        stats->edges[index] = 0u;
        stats->min_high_us[index] = no_pulse;
        stats->min_low_us[index] = no_pulse;
    }
}

static uint32_t frame_gap_us(uint32_t baud)
{
    if (baud == 0u) {
        return UINT32_MAX;
    }
    return (uint32_t)((20000000ull + baud - 1u) / baud);
}

static void copy_frame(const struct sniff_frame_state *state, struct sniff_frame *completed)
{
    completed->hole = state->hole;
    completed->length = state->length;
    memcpy(completed->bytes, state->bytes, state->length);
}

bool sniff_frame_expire(struct sniff_frame_state *state, uint32_t now_us,
                        struct sniff_frame *completed)
{
    if (state == NULL || completed == NULL || state->length == 0u || state->baud == 0u ||
        (uint32_t)(now_us - state->last_byte_us) <= frame_gap_us(state->baud)) {
        return false;
    }

    copy_frame(state, completed);
    state->length = 0u;
    return true;
}

bool sniff_frame_feed(struct sniff_frame_state *state, uint8_t hole, uint32_t baud,
                      uint8_t byte, uint32_t now_us, struct sniff_frame *completed)
{
    bool has_completed = false;

    if (state == NULL || completed == NULL || sniff_hole_index(hole) < 0 || baud == 0u) {
        return false;
    }

    if (state->length > 0u && state->baud != 0u &&
        (uint32_t)(now_us - state->last_byte_us) > frame_gap_us(state->baud)) {
        copy_frame(state, completed);
        state->length = 0u;
        has_completed = true;
    }

    if (state->length == 0u) {
        state->hole = hole;
        state->baud = baud;
    }
    if (state->length < SNIFF_FRAME_MAX_BYTES) {
        state->bytes[state->length++] = byte;
    }
    state->last_byte_us = now_us;
    return has_completed;
}

static bool parse_hole(const char *token, uint8_t *hole)
{
    char *end = NULL;
    const unsigned long value = strtoul(token, &end, 10);

    if (token[0] == '\0' || end == token || *end != '\0' || value > UINT8_MAX ||
        sniff_hole_index((uint8_t)value) < 0) {
        return false;
    }
    *hole = (uint8_t)value;
    return true;
}

static bool parse_baud(const char *token, uint32_t *baud)
{
    char *end = NULL;
    const unsigned long value = strtoul(token, &end, 10);

    if (token[0] == '\0' || end == token || *end != '\0' || value == 0u ||
        value > UINT32_MAX) {
        return false;
    }
    *baud = (uint32_t)value;
    return true;
}

static size_t tokenize(char *line, char *tokens[], size_t capacity)
{
    size_t count = 0u;
    char *cursor = line;

    while (*cursor != '\0') {
        while (isspace((unsigned char)*cursor) != 0) {
            ++cursor;
        }
        if (*cursor == '\0') {
            break;
        }
        if (count == capacity) {
            return capacity + 1u;
        }
        tokens[count++] = cursor;
        while (*cursor != '\0' && isspace((unsigned char)*cursor) == 0) {
            *cursor = (char)tolower((unsigned char)*cursor);
            ++cursor;
        }
        if (*cursor != '\0') {
            *cursor++ = '\0';
        }
    }
    return count;
}

bool sniff_command_parse(const char *line, struct sniff_command *command)
{
    char copy[SNIFF_COMMAND_MAX_LENGTH + 1u];
    char *tokens[4];
    size_t length;
    size_t count;

    if (line == NULL || command == NULL) {
        return false;
    }

    memset(command, 0, sizeof(*command));
    length = strlen(line);
    while (length > 0u && (line[length - 1u] == '\r' || line[length - 1u] == '\n')) {
        --length;
    }
    if (length == 0u || length > SNIFF_COMMAND_MAX_LENGTH) {
        return false;
    }

    memcpy(copy, line, length);
    copy[length] = '\0';
    count = tokenize(copy, tokens, sizeof(tokens) / sizeof(tokens[0]));

    if (count == 1u && strcmp(tokens[0], "help") == 0) {
        command->type = SNIFF_COMMAND_HELP;
        return true;
    }
    if (count == 2u && strcmp(tokens[0], "pull") == 0) {
        command->type = SNIFF_COMMAND_PULL;
        if (strcmp(tokens[1], "none") == 0) {
            command->pull = SNIFF_PULL_NONE;
        } else if (strcmp(tokens[1], "up") == 0) {
            command->pull = SNIFF_PULL_UP;
        } else if (strcmp(tokens[1], "down") == 0) {
            command->pull = SNIFF_PULL_DOWN;
        } else {
            command->type = SNIFF_COMMAND_INVALID;
            return false;
        }
        return true;
    }
    if (count == 2u && strcmp(tokens[0], "uart") == 0 && strcmp(tokens[1], "off") == 0) {
        command->type = SNIFF_COMMAND_UART_OFF;
        return true;
    }
    if ((count == 2u || count == 3u) && strcmp(tokens[0], "uart") == 0) {
        if (!parse_hole(tokens[1], &command->hole)) {
            return false;
        }
        command->baud = 115200u;
        if (count == 3u && !parse_baud(tokens[2], &command->baud)) {
            return false;
        }
        command->type = SNIFF_COMMAND_UART_START;
        return true;
    }
    if (count == 3u && strcmp(tokens[0], "inv") == 0) {
        if (!parse_hole(tokens[1], &command->hole)) {
            return false;
        }
        if (strcmp(tokens[2], "on") == 0) {
            command->enabled = true;
        } else if (strcmp(tokens[2], "off") == 0) {
            command->enabled = false;
        } else {
            return false;
        }
        command->type = SNIFF_COMMAND_INVERT;
        return true;
    }
    return false;
}
