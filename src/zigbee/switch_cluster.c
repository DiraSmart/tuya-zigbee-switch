#include "switch_cluster.h"
#include "base_components/relay.h"
#include "cluster_common.h"
#include "consts.h"
#include "device_config/nvm_items.h"
#include "device_config/device_params_nv.h"
#include "device_config/config_parser.h"
#include "hal/nvm.h"

#include "hal/printf_selector.h"
#include "hal/system.h"
#include "hal/tasks.h"
#include "relay_cluster.h"
#include "zigbee_commands.h"

const uint8_t  multistate_out_of_service = 0;
const uint8_t  multistate_flags          = 0;
const uint16_t multistate_num_of_states  = 3;

#define MULTISTATE_NOT_PRESSED     0
#define MULTISTATE_PRESS           1
#define MULTISTATE_LONG_PRESS      2
#define MULTISTATE_POSITION_ON     3
#define MULTISTATE_POSITION_OFF    4

extern zigbee_relay_cluster relay_clusters[];
extern uint8_t relay_clusters_cnt;
extern zigbee_switch_cluster switch_clusters[];
extern uint8_t switch_clusters_cnt;

void switch_cluster_on_button_press(zigbee_switch_cluster *cluster);
void switch_cluster_on_button_release(zigbee_switch_cluster *cluster);
void switch_cluster_on_button_long_press(zigbee_switch_cluster *cluster);
void switch_cluster_on_multi_press(zigbee_switch_cluster *cluster,
                                   uint8_t press_count);
static bool switch_cluster_has_valid_relay(
    const zigbee_switch_cluster *cluster);

zigbee_switch_cluster *switch_cluster_by_endpoint[10];

static void sync_switch_indicator_led(zigbee_switch_cluster *cluster) {
    if (cluster->indicator_led == NULL) {
        return;
    }

    // Only a plain button owns its LED (lit while held). For the other roles the
    // relay cluster drives it -- from its own state when the gang drives a load,
    // or from whatever Home Assistant writes when it mirrors a light elsewhere.
    // Clearing it here would fight that.
    if (cluster->role != ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_BUTTON) {
        return;
    }

    led_off(cluster->indicator_led);
}

// A 3-way satellite shows a light that lives elsewhere, so the honest value only
// arrives once Home Assistant has acted -- a few hundred milliseconds in which
// the switch looks dead and people press again. Flip the LED now and let the
// next sync correct it if the light did not actually change: a LED that is wrong
// until the next sync beats a switch that feels broken on every single press.
//
// This is display only. The press still travels as an event and Home Assistant
// still decides the real target from the light's true state, so guessing wrong
// here can never flip the wrong light.
static void switch_cluster_optimistic_flip(zigbee_switch_cluster *cluster) {
    if (cluster->role != ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_3WAY ||
        !switch_cluster_has_valid_relay(cluster)) {
        return;
    }

    zigbee_relay_cluster *relay = &relay_clusters[cluster->relay_index - 1];

    // Someone moved the indicator off manual by hand: whatever they chose is
    // driving the LED now, so leave it alone.
    if (relay->indicator_led_mode != ZCL_ONOFF_INDICATOR_MODE_MANUAL) {
        return;
    }

    relay_cluster_set_indicator_state(relay, !relay->indicator_state);
}

void update_switch_clusters() {
    for (int i = 0; i < switch_clusters_cnt; i++) {
        sync_switch_indicator_led(&switch_clusters[i]);
    }
}

static bool switch_cluster_has_valid_relay(const zigbee_switch_cluster *cluster) {
    return cluster->relay_index > 0 && cluster->relay_index <= relay_clusters_cnt;
}

static void switch_cluster_flash_indicator(zigbee_switch_cluster *cluster) {
    if (cluster->indicator_led == NULL) {
        return;
    }
    // Skip flash when relay is attached — the relay toggle itself changes the
    // indicator, and the blink would race with sync_indicator_led.
    if (cluster->relay_mode != ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED &&
        switch_cluster_has_valid_relay(cluster)) {
        return;
    }
    // Only flash when LED is idle (not in "not connected" forever-blink)
    if (cluster->indicator_led->blink_times_left == 0) {
        // 3 blinks: feedback that the button is detached / child-locked
        led_blink(cluster->indicator_led, 100, 100, 3);
    }
}

void switch_cluster_store_attrs_to_nv(zigbee_switch_cluster *cluster);
void switch_cluster_load_attrs_from_nv(zigbee_switch_cluster *cluster);
void switch_cluster_on_write_attr(zigbee_switch_cluster *cluster,
                                  uint16_t attribute_id);

static void switch_cluster_apply_role(zigbee_switch_cluster *cluster);

void switch_cluster_report_action(zigbee_switch_cluster *cluster);

void switch_cluster_callback_attr_write_trampoline(uint8_t endpoint,
                                                   uint16_t attribute_id) {
    switch_cluster_on_write_attr(switch_cluster_by_endpoint[endpoint],
                                 attribute_id);
}

void switch_cluster_add_to_endpoint(zigbee_switch_cluster *cluster,
                                    hal_zigbee_endpoint *endpoint) {
    switch_cluster_by_endpoint[endpoint->endpoint] = cluster;
    cluster->endpoint = endpoint->endpoint;
    switch_cluster_load_attrs_from_nv(cluster);

    cluster->button->on_press =
        (ev_button_callback_t)switch_cluster_on_button_press;
    cluster->button->on_release =
        (ev_button_callback_t)switch_cluster_on_button_release;
    cluster->button->on_long_press =
        (ev_button_callback_t)switch_cluster_on_button_long_press;
    cluster->button->on_multi_press =
        (ev_button_multi_press_callback_t)switch_cluster_on_multi_press;
    cluster->button->callback_param = cluster;

    SETUP_ATTR(0, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_TYPE, ZCL_DATA_TYPE_ENUM8,
               ATTR_READONLY, cluster->mode);
    SETUP_ATTR(1, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_ACTIONS,
               ZCL_DATA_TYPE_ENUM8, ATTR_WRITABLE, cluster->action);
    SETUP_ATTR(2, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_MODE, ZCL_DATA_TYPE_ENUM8,
               ATTR_WRITABLE, cluster->mode);
    SETUP_ATTR(3, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_RELAY_MODE,
               ZCL_DATA_TYPE_ENUM8, ATTR_WRITABLE, cluster->relay_mode);
    SETUP_ATTR(4, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_RELAY_INDEX,
               ZCL_DATA_TYPE_UINT8, ATTR_WRITABLE, cluster->relay_index);
    SETUP_ATTR(5, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_LONG_PRESS_DUR,
               ZCL_DATA_TYPE_UINT16, ATTR_WRITABLE,
               cluster->button->long_press_duration_ms);
    SETUP_ATTR(6, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_LEVEL_MOVE_RATE,
               ZCL_DATA_TYPE_UINT8, ATTR_WRITABLE, cluster->level_move_rate);
    SETUP_ATTR(7, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_BINDING_MODE,
               ZCL_DATA_TYPE_ENUM8, ATTR_WRITABLE, cluster->binded_mode);
    SETUP_ATTR(8, ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_ROLE, ZCL_DATA_TYPE_ENUM8,
               ATTR_WRITABLE, cluster->role);

    // Configuration
    endpoint->clusters[endpoint->cluster_count].cluster_id =
        ZCL_CLUSTER_ON_OFF_SWITCH_CONFIG;
    endpoint->clusters[endpoint->cluster_count].attribute_count = 9;
    endpoint->clusters[endpoint->cluster_count].attributes      = cluster->attr_infos;
    endpoint->clusters[endpoint->cluster_count].is_server       = 1;
    endpoint->cluster_count++;

    // Output ON OFF to bind to other devices
    endpoint->clusters[endpoint->cluster_count].cluster_id      = ZCL_CLUSTER_ON_OFF;
    endpoint->clusters[endpoint->cluster_count].attribute_count = 0;
    endpoint->clusters[endpoint->cluster_count].attributes      = NULL;
    endpoint->clusters[endpoint->cluster_count].is_server       = 0;
    endpoint->cluster_count++;

    SETUP_ATTR_FOR_TABLE(cluster->multistate_attr_infos, 0,
                         ZCL_ATTR_MULTISTATE_INPUT_NUMBER_OF_STATES,
                         ZCL_DATA_TYPE_UINT16, ATTR_READONLY,
                         multistate_num_of_states);
    SETUP_ATTR_FOR_TABLE(cluster->multistate_attr_infos, 1,
                         ZCL_ATTR_MULTISTATE_INPUT_OUT_OF_SERVICE,
                         ZCL_DATA_TYPE_BOOLEAN, ATTR_READONLY,
                         multistate_out_of_service);
    SETUP_ATTR_FOR_TABLE(cluster->multistate_attr_infos, 2,
                         ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE,
                         ZCL_DATA_TYPE_UINT16, ATTR_READONLY,
                         cluster->multistate_state);
    SETUP_ATTR_FOR_TABLE(cluster->multistate_attr_infos, 3,
                         ZCL_ATTR_MULTISTATE_INPUT_STATUS_FLAGS,
                         ZCL_DATA_TYPE_BITMAP8, ATTR_READONLY, multistate_flags);

    // Output
    endpoint->clusters[endpoint->cluster_count].cluster_id =
        ZCL_CLUSTER_MULTISTATE_INPUT_BASIC;
    endpoint->clusters[endpoint->cluster_count].attribute_count = 4;
    endpoint->clusters[endpoint->cluster_count].attributes      =
        cluster->multistate_attr_infos;
    endpoint->clusters[endpoint->cluster_count].is_server = 1;
    endpoint->cluster_count++;

    // Output Level for other devices
    endpoint->clusters[endpoint->cluster_count].cluster_id =
        ZCL_CLUSTER_LEVEL_CONTROL;
    endpoint->clusters[endpoint->cluster_count].attribute_count = 0;
    endpoint->clusters[endpoint->cluster_count].attributes      = NULL;
    endpoint->clusters[endpoint->cluster_count].is_server       = 0;
    endpoint->cluster_count++;
}

// Perform the relay action for ON position (position 1 in ZCL docs)
void switch_cluster_relay_action_on(zigbee_switch_cluster *cluster) {
    if (!switch_cluster_has_valid_relay(cluster))
        return;

    zigbee_relay_cluster *relay_cluster =
        &relay_clusters[cluster->relay_index - 1];

    // Local button press: the button's binding_action below already propagates
    // to 3-way targets, so suppress the relay-change mirror to avoid a duplicate.
    relay_cluster_mirror_suppressed = true;
    switch (cluster->action) {
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_ONOFF:
        relay_cluster_on(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_OFFON:
        relay_cluster_off(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SIMPLE:
        relay_cluster_toggle(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC:
        relay_cluster_toggle(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_OPPOSITE:
        relay_cluster_toggle(relay_cluster);
        break;
    }
    relay_cluster_mirror_suppressed = false;
}

// Perform the relay action for OFF position (position 2 in ZCL docs)
void switch_cluster_relay_action_off(zigbee_switch_cluster *cluster) {
    if (!switch_cluster_has_valid_relay(cluster))
        return;

    zigbee_relay_cluster *relay_cluster =
        &relay_clusters[cluster->relay_index - 1];

    // Local button press: the button's binding_action below already propagates
    // to 3-way targets, so suppress the relay-change mirror to avoid a duplicate.
    relay_cluster_mirror_suppressed = true;
    switch (cluster->action) {
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_ONOFF:
        relay_cluster_off(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_OFFON:
        relay_cluster_on(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SIMPLE:
        relay_cluster_toggle(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC:
        relay_cluster_toggle(relay_cluster);
        break;
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_OPPOSITE:
        relay_cluster_toggle(relay_cluster);
        break;
    }
    relay_cluster_mirror_suppressed = false;
}

// Send OnOff command to binded device based on ON position (position 1 in
// ZCL docs)
void switch_cluster_binding_action_on(zigbee_switch_cluster *cluster) {
    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        return;
    }

    uint8_t cmd_id;

    switch (cluster->action) {
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_ONOFF:
        cmd_id = ZCL_CMD_ONOFF_ON;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_OFFON:
        cmd_id = ZCL_CMD_ONOFF_OFF;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SIMPLE:
        cmd_id = ZCL_CMD_ONOFF_TOGGLE;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC:
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_OPPOSITE:
        if (!switch_cluster_has_valid_relay(cluster)) {
            cmd_id = ZCL_CMD_ONOFF_TOGGLE;
        } else {
            zigbee_relay_cluster *relay_cluster =
                &relay_clusters[cluster->relay_index - 1];
            if (cluster->action ==
                ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC)
                cmd_id = (relay_cluster->relay->on) ? ZCL_CMD_ONOFF_ON
                                                    : ZCL_CMD_ONOFF_OFF;
            else
                cmd_id = (relay_cluster->relay->on) ? ZCL_CMD_ONOFF_OFF
                                                    : ZCL_CMD_ONOFF_ON;
        }
        break;

    default:
        return;
    }

    hal_zigbee_cmd c = build_onoff_cmd(cluster->endpoint, cmd_id);
    hal_zigbee_send_cmd_to_bindings(&c);
}

// Forward a relay's current state to the bindings of the button(s) that drive
// it. Sends an ABSOLUTE ON/OFF command (never TOGGLE) so the mirror is
// idempotent — together with the transition guard in the relay cluster this
// guarantees a bounced-back command stops instead of looping forever.
void switch_cluster_mirror_relay_state(zigbee_relay_cluster *relay_cluster,
                                       uint8_t state) {
    if (relay_cluster == NULL) {
        return;
    }
    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        return;
    }

    uint8_t cmd_id = state ? ZCL_CMD_ONOFF_ON : ZCL_CMD_ONOFF_OFF;

    for (int i = 0; i < switch_clusters_cnt; i++) {
        zigbee_switch_cluster *cluster = &switch_clusters[i];
        if (cluster->relay_index == 0 ||
            cluster->relay_index > relay_clusters_cnt) {
            continue;
        }
        if (&relay_clusters[cluster->relay_index - 1] != relay_cluster) {
            continue;
        }
        hal_zigbee_cmd c = build_onoff_cmd(cluster->endpoint, cmd_id);
        hal_zigbee_send_cmd_to_bindings(&c);
    }
}

// Send OnOff command to binded device based on OFF position (position 2 in
// ZCL docs)
void switch_cluster_binding_action_off(zigbee_switch_cluster *cluster) {
    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        return;
    }

    uint8_t cmd_id;

    switch (cluster->action) {
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_ONOFF:
        cmd_id = ZCL_CMD_ONOFF_OFF;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_OFFON:
        cmd_id = ZCL_CMD_ONOFF_ON;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SIMPLE:
        cmd_id = ZCL_CMD_ONOFF_TOGGLE;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC:
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_OPPOSITE:
        if (!switch_cluster_has_valid_relay(cluster)) {
            cmd_id = ZCL_CMD_ONOFF_TOGGLE;
        } else {
            zigbee_relay_cluster *relay_cluster =
                &relay_clusters[cluster->relay_index - 1];
            if (cluster->action ==
                ZCL_ONOFF_CONFIGURATION_SWITCH_ACTION_TOGGLE_SMART_SYNC)
                cmd_id = (relay_cluster->relay->on) ? ZCL_CMD_ONOFF_ON
                                                    : ZCL_CMD_ONOFF_OFF;
            else
                cmd_id = (relay_cluster->relay->on) ? ZCL_CMD_ONOFF_OFF
                                                    : ZCL_CMD_ONOFF_ON;
        }
        break;

    default:
        return;
    }

    hal_zigbee_cmd c = build_onoff_cmd(cluster->endpoint, cmd_id);
    hal_zigbee_send_cmd_to_bindings(&c);
}

void switch_cluster_level_stop(zigbee_switch_cluster *cluster) {
    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        return;
    }

    hal_zigbee_cmd c = build_level_stop_onoff_cmd(cluster->endpoint);
    hal_zigbee_send_cmd_to_bindings(&c);
}

void switch_cluster_level_control(zigbee_switch_cluster *cluster) {
    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        return;
    }

    hal_zigbee_cmd c = build_level_move_onoff_cmd(cluster->endpoint,
                                                  cluster->level_move_direction,
                                                  cluster->level_move_rate);
    hal_zigbee_send_cmd_to_bindings(&c);

    if (cluster->level_move_direction == ZCL_LEVEL_MOVE_DOWN) {
        cluster->level_move_direction = ZCL_LEVEL_MOVE_UP;
    } else {
        cluster->level_move_direction = ZCL_LEVEL_MOVE_DOWN;
    }
}

void switch_cluster_on_button_press(zigbee_switch_cluster *cluster) {
    if (g_child_lock_enabled && g_child_lock_active) {
        return; // child-locked: button does nothing (network LED shows the lock)
    }
    if (cluster->role == ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_BUTTON) {
        // scene/cover button: light the indicator while held, off on release
        if (cluster->indicator_led != NULL) {
            led_on(cluster->indicator_led);
        }
    } else if (cluster->role == ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_RELAY) {
        switch_cluster_flash_indicator(cluster);
    }
    // 3-way: the LED shows the state of a light that lives elsewhere. Flashing
    // it would read as the light having changed when it may not have; flip it to
    // the state this press is asking for instead.
    switch_cluster_optimistic_flip(cluster);

    if (cluster->mode == ZCL_ONOFF_CONFIGURATION_SWITCH_TYPE_TOGGLE) {
        // Toggle does not support modes (RISE, SHORT, LONG)
        if (cluster->relay_mode != ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED) {
            switch_cluster_relay_action_on(cluster);
        }
        switch_cluster_binding_action_on(cluster);
        cluster->multistate_state = MULTISTATE_POSITION_ON;
        hal_zigbee_notify_attribute_changed(
            cluster->endpoint, ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
            ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
        return;
    }

    if (cluster->relay_mode == ZCL_ONOFF_CONFIGURATION_RELAY_MODE_RISE) {
        switch_cluster_relay_action_on(cluster);
    }

    if (cluster->binded_mode == ZCL_ONOFF_CONFIGURATION_BINDED_MODE_RISE) {
        switch_cluster_binding_action_on(cluster);
    }

    cluster->multistate_state = MULTISTATE_PRESS;
    hal_zigbee_notify_attribute_changed(cluster->endpoint,
                                        ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
                                        ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
}

void switch_cluster_on_button_release(zigbee_switch_cluster *cluster) {
    if (g_child_lock_enabled && g_child_lock_active) {
        return; // device child-locked: physical button does nothing
    }
    if (cluster->role == ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_BUTTON &&
        cluster->indicator_led != NULL) {
        led_off(cluster->indicator_led); // scene button: indicator off on release
    }
    if (cluster->mode == ZCL_ONOFF_CONFIGURATION_SWITCH_TYPE_TOGGLE) {
        // Only flash on release for toggles,
        // for momentary flash on press only
        switch_cluster_flash_indicator(cluster);
    }

    if (cluster->mode == ZCL_ONOFF_CONFIGURATION_SWITCH_TYPE_TOGGLE) {
        // Toggle does not support modes (RISE, SHORT, LONG)
        if (cluster->relay_mode != ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED) {
            switch_cluster_relay_action_off(cluster);
        }
        switch_cluster_binding_action_off(cluster);
        // A maintained rocker makes two actions, one per direction, so releasing
        // it asks for a change just like pressing it did. A momentary button
        // does not: its release is the end of one press, and flipping again
        // would undo the flip above.
        switch_cluster_optimistic_flip(cluster);
        cluster->multistate_state = MULTISTATE_POSITION_OFF;
        hal_zigbee_notify_attribute_changed(
            cluster->endpoint, ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
            ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
        return;
    }

    if (cluster->multistate_state != MULTISTATE_LONG_PRESS) {
        if (cluster->relay_mode == ZCL_ONOFF_CONFIGURATION_RELAY_MODE_SHORT) {
            switch_cluster_relay_action_on(cluster);
        }
        if (cluster->binded_mode == ZCL_ONOFF_CONFIGURATION_BINDED_MODE_SHORT) {
            switch_cluster_binding_action_on(cluster);
        }
    } else {
        // This is end of long press, send zcl_level stop
        switch_cluster_level_stop(cluster);
    }

    cluster->multistate_state = MULTISTATE_NOT_PRESSED;
    hal_zigbee_notify_attribute_changed(cluster->endpoint,
                                        ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
                                        ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
}

void switch_cluster_on_button_long_press(zigbee_switch_cluster *cluster) {
    // Long press (~2s) emits a "long_press" event via the multistate input for
    // HA automations (scenes / covers, esp. for decoupled/virtual buttons).
    // A factory reset is a separate, longer hold (~6s) -> on_very_long_press.
    if (g_child_lock_enabled && g_child_lock_active) {
        return;
    }
    cluster->multistate_state = MULTISTATE_LONG_PRESS;
    hal_zigbee_notify_attribute_changed(cluster->endpoint,
                                        ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
                                        ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
}

void switch_cluster_on_multi_press(zigbee_switch_cluster *cluster,
                                   uint8_t press_count) {
    // 5 quick presses on ANY button toggle the whole-device (general) child
    // lock, but only when the child lock feature is enabled.
    (void)cluster;
    if (!g_child_lock_enabled) {
        return;
    }
    if (press_count != 5) {
        return;
    }
    device_params_set_child_lock_active(!g_child_lock_active);
    refresh_network_led();
    hal_zigbee_notify_attribute_changed(1, ZCL_CLUSTER_BASIC,
                                        ZCL_ATTR_BASIC_CHILD_LOCK);
}

void synchronize_multistate_state(zigbee_switch_cluster *cluster) {
    if (cluster->mode == ZCL_ONOFF_CONFIGURATION_SWITCH_TYPE_TOGGLE) {
        if (cluster->button->pressed) {
            cluster->multistate_state = MULTISTATE_POSITION_ON;
        } else {
            cluster->multistate_state = MULTISTATE_POSITION_OFF;
        }
    } else {
        if (cluster->button->long_pressed) {
            cluster->multistate_state = MULTISTATE_LONG_PRESS;
        } else if (cluster->button->pressed) {
            cluster->multistate_state = MULTISTATE_PRESS;
        } else {
            cluster->multistate_state = MULTISTATE_NOT_PRESSED;
        }
    }
    hal_zigbee_notify_attribute_changed(cluster->endpoint,
                                        ZCL_CLUSTER_MULTISTATE_INPUT_BASIC,
                                        ZCL_ATTR_MULTISTATE_INPUT_PRESENT_VALUE);
}

// One write configures a gang. Picking a role from Home Assistant has to be
// enough: asking an installer to also get relay mode, indicator mode and
// power-on right, per gang, across dozens of switches, is how a house ends up
// half-configured.
static void switch_cluster_apply_role(zigbee_switch_cluster *cluster) {
    uint8_t relay_mode;
    uint8_t indicator_mode;
    uint8_t startup_mode;

    switch (cluster->role) {
    case ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_3WAY:
        // Mirrors a light that lives elsewhere: the button must not move the
        // local relay, and the LED must obey whoever reports that light rather
        // than a relay that controls nothing.
        relay_mode     = ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED;
        indicator_mode = ZCL_ONOFF_INDICATOR_MODE_MANUAL;
        startup_mode   = ZCL_START_UP_ONOFF_SET_ONOFF_TO_OFF;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_BUTTON:
        // Scenes and covers: no load at all. The relay cluster leaves the LED
        // alone so the button can light it while held.
        relay_mode     = ZCL_ONOFF_CONFIGURATION_RELAY_MODE_DETACHED;
        indicator_mode = ZCL_ONOFF_INDICATOR_MODE_OFF;
        startup_mode   = ZCL_START_UP_ONOFF_SET_ONOFF_TO_OFF;
        break;

    case ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_RELAY:
    default:
        cluster->role  = ZCL_ONOFF_CONFIGURATION_SWITCH_ROLE_RELAY;
        relay_mode     = ZCL_ONOFF_CONFIGURATION_RELAY_MODE_SHORT;
        indicator_mode = ZCL_ONOFF_INDICATOR_MODE_SAME;
        startup_mode   = ZCL_START_UP_ONOFF_SET_ONOFF_TO_PREVIOUS;
        break;
    }

    cluster->relay_mode = relay_mode;

    if (switch_cluster_has_valid_relay(cluster)) {
        relay_cluster_apply_role_settings(&relay_clusters[cluster->relay_index - 1],
                                          indicator_mode, startup_mode);
    }

    sync_switch_indicator_led(cluster);
}

void switch_cluster_on_write_attr(zigbee_switch_cluster *cluster,
                                  uint16_t attribute_id) {
    if (attribute_id == ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_ROLE) {
        switch_cluster_apply_role(cluster);
        switch_cluster_store_attrs_to_nv(cluster);
        return;
    }
    printf("Index at write attr: %d\r\n", cluster->switch_idx);
    if (attribute_id == ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_RELAY_INDEX) {
        if (relay_clusters_cnt == 0) {
            cluster->relay_index = 0;
        } else if (cluster->relay_index < 1 || cluster->relay_index > relay_clusters_cnt) {
            cluster->relay_index = 1;
        }
    }
    if (attribute_id == ZCL_ATTR_ONOFF_CONFIGURATION_SWITCH_MODE) {
        synchronize_multistate_state(cluster);
        if (cluster->mode == ZCL_ONOFF_CONFIGURATION_SWITCH_TYPE_MOMENTARY_NC) {
            cluster->button->pressed_when_high = 1;
        } else {
            cluster->button->pressed_when_high = 0;
        }
    }
    switch_cluster_store_attrs_to_nv(cluster);
}

zigbee_switch_cluster_config nv_config_buffer;

void switch_cluster_store_attrs_to_nv(zigbee_switch_cluster *cluster) {
    nv_config_buffer.action      = cluster->action;
    nv_config_buffer.mode        = cluster->mode;
    nv_config_buffer.relay_index = cluster->relay_index;
    nv_config_buffer.relay_mode  = cluster->relay_mode;
    nv_config_buffer.button_long_press_duration =
        cluster->button->long_press_duration_ms;
    nv_config_buffer.level_move_rate = cluster->level_move_rate;
    nv_config_buffer.binded_mode     = cluster->binded_mode;
    nv_config_buffer.role            = cluster->role;
    hal_nvm_write(NV_ITEM_SWITCH_CLUSTER_DATA(cluster->switch_idx),
                  sizeof(zigbee_switch_cluster_config),
                  (uint8_t *)&nv_config_buffer);
}

void switch_cluster_load_attrs_from_nv(zigbee_switch_cluster *cluster) {
    hal_nvm_status_t st = hal_nvm_read(
        NV_ITEM_SWITCH_CLUSTER_DATA(cluster->switch_idx),
        sizeof(zigbee_switch_cluster_config), (uint8_t *)&nv_config_buffer);

    if (st != HAL_NVM_SUCCESS) {
        printf("No switch config in NV, using defaults\r\n");
        return;
    }
    cluster->action      = nv_config_buffer.action;
    cluster->mode        = nv_config_buffer.mode;
    cluster->relay_index = nv_config_buffer.relay_index;
    cluster->relay_mode  = nv_config_buffer.relay_mode;
    cluster->button->long_press_duration_ms =
        nv_config_buffer.button_long_press_duration;
    cluster->level_move_rate = nv_config_buffer.level_move_rate;
    cluster->binded_mode     = nv_config_buffer.binded_mode;
    // Restored, not re-applied: relay_mode here and the relay's indicator and
    // power-on modes each come back from their own NV, so replaying the role on
    // boot would overwrite a deliberate per-field tweak with the role default.
    cluster->role            = nv_config_buffer.role;

    // Validate relay_index to prevent out-of-bounds access
    if (relay_clusters_cnt == 0) {
        cluster->relay_index = 0;
    } else if (cluster->relay_index < 1 || cluster->relay_index > relay_clusters_cnt) {
        printf("Invalid relay_index %d in NV, resetting to default\r\n",
               cluster->relay_index);
        cluster->relay_index = cluster->switch_idx + 1;
    }
}
