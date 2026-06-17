#include "relay_cluster.h"
#include "cluster_common.h"
#include "consts.h"
#include "device_config/config_parser.h"
#include "device_config/device_params_nv.h"
#include "device_config/nvm_items.h"
#include "hal/nvm.h"
#include "hal/printf_selector.h"
#include "switch_cluster.h"

hal_zigbee_cmd_result_t relay_cluster_callback(zigbee_relay_cluster *cluster,
                                               uint8_t command_id,
                                               void *cmd_payload,
                                               uint16_t cmd_payload_len);
hal_zigbee_cmd_result_t relay_cluster_callback_trampoline(uint8_t endpoint,
                                                          uint16_t cluster_id,
                                                          uint8_t command_id,
                                                          void *cmd_payload,
                                                          uint16_t cmd_payload_len);

hal_zigbee_cmd_result_t relay_cluster_level_callback(zigbee_relay_cluster *cluster,
                                                     uint8_t command_id,
                                                     void *cmd_payload,
                                                     uint16_t cmd_payload_len);
hal_zigbee_cmd_result_t relay_cluster_level_callback_trampoline(uint8_t endpoint,
                                                                uint16_t cluster_id,
                                                                uint8_t command_id,
                                                                void *cmd_payload,
                                                                uint16_t cmd_payload_len);

void relay_cluster_on_relay_change(zigbee_relay_cluster *cluster,
                                   uint8_t state);
void relay_cluster_on_write_attr(zigbee_relay_cluster *cluster,
                                 uint16_t attribute_id);

void relay_cluster_store_attrs_to_nv(zigbee_relay_cluster *cluster);
void relay_cluster_load_attrs_from_nv(zigbee_relay_cluster *cluster);
void relay_cluster_handle_startup_mode(zigbee_relay_cluster *cluster);

void sync_indicator_led(zigbee_relay_cluster *cluster);

zigbee_relay_cluster *relay_cluster_by_endpoint[10];

bool relay_cluster_mirror_suppressed = false;

extern zigbee_relay_cluster  relay_clusters[];
extern uint8_t               relay_clusters_cnt;
extern zigbee_switch_cluster switch_clusters[];
extern uint8_t               switch_clusters_cnt;

// True if switch `sw` drives relay `relay` (so its button should send to the
// relay's sync group).
static bool switch_controls_relay(const zigbee_switch_cluster *sw,
                                  const zigbee_relay_cluster *relay) {
    return sw->relay_index > 0 && sw->relay_index <= relay_clusters_cnt &&
           &relay_clusters[sw->relay_index - 1] == relay;
}

// Apply each relay's own sync group: the relay joins the group (to receive
// groupcasts) and every button that controls it binds genOnOff to the group
// (to send). Per-light, so on a multi-gang device each l1/l2 can be in a
// different group (or none). Cleans up a previously applied group on change.
void sync_group_apply(void) {
    for (int i = 0; i < relay_clusters_cnt; i++) {
        zigbee_relay_cluster *relay = &relay_clusters[i];
        uint16_t              want  = relay->sync_group_id;
        uint16_t              have  = relay->applied_sync_group_id;

        if (want == have) {
            continue;
        }

        if (have != 0) {
            hal_zigbee_group_remove(relay->endpoint, have);
            for (int j = 0; j < switch_clusters_cnt; j++) {
                if (switch_controls_relay(&switch_clusters[j], relay)) {
                    hal_zigbee_unbind_from_group(switch_clusters[j].endpoint,
                                                 ZCL_CLUSTER_ON_OFF, have);
                }
            }
        }
        if (want != 0) {
            hal_zigbee_group_add(relay->endpoint, want);
            for (int j = 0; j < switch_clusters_cnt; j++) {
                if (switch_controls_relay(&switch_clusters[j], relay)) {
                    hal_zigbee_bind_to_group(switch_clusters[j].endpoint,
                                             ZCL_CLUSTER_ON_OFF, want);
                }
            }
        }
        relay->applied_sync_group_id = want;
    }
}

void relay_cluster_callback_attr_write_trampoline(uint8_t endpoint,
                                                  uint16_t attribute_id) {
    relay_cluster_on_write_attr(relay_cluster_by_endpoint[endpoint],
                                attribute_id);
}

void update_relay_clusters() {
    for (int i = 0; i < 10; i++) {
        if (relay_cluster_by_endpoint[i] != NULL) {
            sync_indicator_led(relay_cluster_by_endpoint[i]);
        }
    }
}

void relay_cluster_report(zigbee_relay_cluster *cluster) {
    hal_zigbee_notify_attribute_changed(cluster->endpoint, ZCL_CLUSTER_ON_OFF,
                                        ZCL_ATTR_ONOFF);
}

// Report every relay's current on/off state. Called on boot/join so z2m/HA
// re-sync after a power outage or coordinator restart.
void report_all_relay_states() {
    for (int i = 0; i < 10; i++) {
        if (relay_cluster_by_endpoint[i] != NULL) {
            relay_cluster_report(relay_cluster_by_endpoint[i]);
        }
    }
}

void relay_cluster_add_to_endpoint(zigbee_relay_cluster *cluster,
                                   hal_zigbee_endpoint *endpoint) {
    relay_cluster_by_endpoint[endpoint->endpoint] = cluster;
    cluster->endpoint = endpoint->endpoint;
    relay_cluster_load_attrs_from_nv(cluster);

    cluster->relay->callback_param = cluster;
    cluster->relay->on_change      = (relay_callback_t)relay_cluster_on_relay_change;

    relay_cluster_handle_startup_mode(cluster);
    sync_indicator_led(cluster);

    SETUP_ATTR(0, ZCL_ATTR_ONOFF, ZCL_DATA_TYPE_BOOLEAN, ATTR_READONLY,
               cluster->relay->on);
    SETUP_ATTR(1, ZCL_ATTR_START_UP_ONOFF, ZCL_DATA_TYPE_ENUM8, ATTR_WRITABLE,
               cluster->startup_mode);
    SETUP_ATTR(2, ZCL_ATTR_ONOFF_SYNC_GROUP_ID, ZCL_DATA_TYPE_UINT16,
               ATTR_WRITABLE, cluster->sync_group_id);
    if (cluster->indicator_led != NULL) {
        SETUP_ATTR(3, ZCL_ATTR_ONOFF_INDICATOR_MODE, ZCL_DATA_TYPE_ENUM8,
                   ATTR_WRITABLE, cluster->indicator_led_mode);
        SETUP_ATTR(4, ZCL_ATTR_ONOFF_INDICATOR_STATE, ZCL_DATA_TYPE_BOOLEAN,
                   ATTR_WRITABLE, cluster->indicator_state);
    }

    endpoint->clusters[endpoint->cluster_count].cluster_id      = ZCL_CLUSTER_ON_OFF;
    endpoint->clusters[endpoint->cluster_count].attribute_count =
        cluster->indicator_led != NULL ? 5 : 3;
    endpoint->clusters[endpoint->cluster_count].attributes   = cluster->attr_infos;
    endpoint->clusters[endpoint->cluster_count].is_server    = 1;
    endpoint->clusters[endpoint->cluster_count].cmd_callback =
        relay_cluster_callback_trampoline;
    endpoint->cluster_count++;

    // NOTE: the relay endpoint intentionally does NOT advertise genLevelCtrl.
    // It is an on/off relay; exposing LevelControl makes HA treat it as a
    // dimmable light (brightness slider). On/off binding uses genOnOff only.
    // (relay_cluster_level_callback is kept for reference but not registered.)
}

hal_zigbee_cmd_result_t relay_cluster_callback_trampoline(uint8_t endpoint,
                                                          uint16_t cluster_id,
                                                          uint8_t command_id,
                                                          void *cmd_payload,
                                                          uint16_t cmd_payload_len) {
    return relay_cluster_callback(relay_cluster_by_endpoint[endpoint], command_id,
                                  cmd_payload, cmd_payload_len);
}

hal_zigbee_cmd_result_t relay_cluster_callback(zigbee_relay_cluster *cluster,
                                               uint8_t command_id,
                                               void *cmd_payload,
                                               uint16_t cmd_payload_len) {
    // Mirror this change to 3-way bindings ONLY if it arrived as a UNICAST from
    // the coordinator (Home Assistant / z2m, addr 0x0000):
    //   - peer command (another switch's binding): must not echo back, or a
    //     mesh-delayed command racing a later contradicting one would bounce
    //     and revert the relay to a stale state;
    //   - groupcast (a Zigbee group): every member already got it directly, so
    //     re-broadcasting would just add redundant traffic (scales badly with
    //     many switches in a multi-way group).
    // This way even an individual relay toggled from HA still propagates to a
    // whole group (mirror -> button binding -> groupcast) without looping.
    relay_cluster_mirror_suppressed =
        (hal_zigbee_get_current_command_source() != 0x0000) ||
        hal_zigbee_get_current_command_is_groupcast();

    hal_zigbee_cmd_result_t result = HAL_ZIGBEE_CMD_PROCESSED;
    switch (command_id) {
    case ZCL_CMD_ONOFF_ON:
    case ZCL_CMD_ON_WITH_RECALL_GLOBAL_SCENE:
        relay_cluster_on(cluster);
        break;

    case ZCL_CMD_ONOFF_OFF:
    case ZCL_CMD_OFF_WITH_EFFECT:
        relay_cluster_off(cluster);
        break;

    case ZCL_CMD_ONOFF_TOGGLE:
        relay_cluster_toggle(cluster);
        break;

    default:
        printf("Unknown OnOff command: %d\r\n", command_id);
        result = HAL_ZIGBEE_CMD_SKIPPED;
        break;
    }

    relay_cluster_mirror_suppressed = false;
    return result;
}

hal_zigbee_cmd_result_t relay_cluster_level_callback_trampoline(uint8_t endpoint,
                                                                uint16_t cluster_id,
                                                                uint8_t command_id,
                                                                void *cmd_payload,
                                                                uint16_t cmd_payload_len) {
    return relay_cluster_level_callback(relay_cluster_by_endpoint[endpoint], command_id,
                                        cmd_payload, cmd_payload_len);
}

hal_zigbee_cmd_result_t relay_cluster_level_callback(zigbee_relay_cluster *cluster,
                                                     uint8_t command_id,
                                                     void *cmd_payload,
                                                     uint16_t cmd_payload_len) {
    switch (command_id) {
    case ZCL_CMD_LEVEL_MOVE_TO_LEVEL_WITH_ON_OFF:
        if (cmd_payload == NULL || cmd_payload_len < 1) {
            return HAL_ZIGBEE_MALFORMED_COMMAND;
        }
        uint8_t level = *(uint8_t *)cmd_payload;
        if (level == 0) {
            relay_cluster_off(cluster);
        } else {
            relay_cluster_on(cluster);
        }
        break;

    default:
        printf("Unknown LevelCtrl command: %d\r\n", command_id);
        return HAL_ZIGBEE_CMD_SKIPPED;
    }
    return HAL_ZIGBEE_CMD_PROCESSED;
}

void sync_indicator_led(zigbee_relay_cluster *cluster) {
    if (cluster->indicator_led == NULL) {
        return;
    }

    // Child lock can hide the relay indicator LED (config token "H"): while the
    // lock is active, force the relay LED off (the network LED shows the lock).
    if (child_lock_hides_relay_led && g_child_lock_enabled && g_child_lock_active) {
        cluster->indicator_state = 0;
        led_off(cluster->indicator_led);
        hal_zigbee_notify_attribute_changed(cluster->endpoint, ZCL_CLUSTER_ON_OFF,
                                            ZCL_ATTR_ONOFF_INDICATOR_STATE);
        return;
    }

    if (cluster->indicator_led_mode == ZCL_ONOFF_INDICATOR_MODE_OFF) {
        cluster->indicator_state = 0; // always off
    } else if (cluster->indicator_led_mode == ZCL_ONOFF_INDICATOR_MODE_SAME) {
        cluster->indicator_state = cluster->relay->on;
    } else if (cluster->indicator_led_mode == ZCL_ONOFF_INDICATOR_MODE_OPPOSITE) {
        cluster->indicator_state = !cluster->relay->on;
    }
    // MANUAL: leave indicator_state unchanged

    cluster->indicator_state ? led_on(cluster->indicator_led)
                           : led_off(cluster->indicator_led);

    hal_zigbee_notify_attribute_changed(cluster->endpoint, ZCL_CLUSTER_ON_OFF,
                                        ZCL_ATTR_ONOFF_INDICATOR_STATE);
}

void relay_cluster_on(zigbee_relay_cluster *cluster) {
    relay_on(cluster->relay);
    sync_indicator_led(cluster);
}

void relay_cluster_off(zigbee_relay_cluster *cluster) {
    relay_off(cluster->relay);
    sync_indicator_led(cluster);
}

void relay_cluster_toggle(zigbee_relay_cluster *cluster) {
    relay_toggle(cluster->relay);
    sync_indicator_led(cluster);
}

void relay_cluster_on_relay_change(zigbee_relay_cluster *cluster,
                                   uint8_t state) {
    hal_zigbee_notify_attribute_changed(cluster->endpoint, ZCL_CLUSTER_ON_OFF,
                                        ZCL_ATTR_ONOFF);

    // 3-way mirror with anti-loop guard: only forward to bindings on a real
    // state transition. relay_on/relay_off fire this callback even when the
    // relay was already in the requested state (e.g. a mirrored command
    // bouncing back), so guarding on the transition is what breaks the loop.
    if (state != cluster->mirror_last_state) {
        cluster->mirror_last_state = state;
        if (!relay_cluster_mirror_suppressed) {
            switch_cluster_mirror_relay_state(cluster, state);
        }
    }

    if (cluster->startup_mode == ZCL_START_UP_ONOFF_SET_ONOFF_TOGGLE ||
        cluster->startup_mode == ZCL_START_UP_ONOFF_SET_ONOFF_TO_PREVIOUS) {
        relay_cluster_store_attrs_to_nv(cluster);
    }
}

void relay_cluster_on_write_attr(zigbee_relay_cluster *cluster,
                                 uint16_t attribute_id) {
    if (attribute_id == ZCL_ATTR_ONOFF_SYNC_GROUP_ID) {
        // Persist in its own NV item and (re)apply group membership + bindings.
        uint16_t group_id = cluster->sync_group_id;
        hal_nvm_write(NV_ITEM_RELAY_SYNC_GROUP(cluster->relay_idx),
                      sizeof(group_id), (uint8_t *)&group_id);
        sync_group_apply();
        return;
    }
    if (attribute_id == ZCL_ATTR_ONOFF_INDICATOR_STATE) {
        sync_indicator_led(cluster);
    }
    if (cluster->indicator_led_mode != ZCL_ONOFF_INDICATOR_MODE_MANUAL) {
        sync_indicator_led(cluster);
    }

    relay_cluster_store_attrs_to_nv(cluster);
}

typedef struct {
    uint8_t on_off;
    uint8_t startup_mode;
    uint8_t indicator_led_mode;
    uint8_t indicator_led_on;
} zigbee_relay_cluster_config;

static zigbee_relay_cluster_config nv_config_buffer;

void relay_cluster_store_attrs_to_nv(zigbee_relay_cluster *cluster) {
    nv_config_buffer.on_off             = cluster->relay->on;
    nv_config_buffer.startup_mode       = cluster->startup_mode;
    nv_config_buffer.indicator_led_mode = cluster->indicator_led_mode;
    if (cluster->indicator_led != NULL) {
        nv_config_buffer.indicator_led_on = cluster->indicator_state;
    }

    hal_nvm_write(NV_ITEM_RELAY_CLUSTER_DATA(cluster->relay_idx),
                  sizeof(zigbee_relay_cluster_config),
                  (uint8_t *)&nv_config_buffer);
}

void relay_cluster_load_attrs_from_nv(zigbee_relay_cluster *cluster) {
    // Sync group id is stored in its own NV item (independent of the config
    // struct below), so read it separately and unconditionally.
    uint16_t group_id;
    if (hal_nvm_read(NV_ITEM_RELAY_SYNC_GROUP(cluster->relay_idx),
                     sizeof(group_id),
                     (uint8_t *)&group_id) == HAL_NVM_SUCCESS) {
        cluster->sync_group_id = group_id;
    }

    hal_nvm_status_t st = hal_nvm_read(
        NV_ITEM_RELAY_CLUSTER_DATA(cluster->relay_idx),
        sizeof(zigbee_relay_cluster_config), (uint8_t *)&nv_config_buffer);

    if (st != HAL_NVM_SUCCESS)
        return;

    cluster->startup_mode       = nv_config_buffer.startup_mode;
    cluster->indicator_led_mode = nv_config_buffer.indicator_led_mode;
    cluster->indicator_state    = nv_config_buffer.indicator_led_on;
}

void relay_cluster_handle_startup_mode(zigbee_relay_cluster *cluster) {
    hal_nvm_status_t st = hal_nvm_read(
        NV_ITEM_RELAY_CLUSTER_DATA(cluster->relay_idx),
        sizeof(zigbee_relay_cluster_config), (uint8_t *)&nv_config_buffer);

    if (st != HAL_NVM_SUCCESS)
        return;

    uint8_t prev_on = nv_config_buffer.on_off;

    switch (cluster->startup_mode) {
    case ZCL_START_UP_ONOFF_SET_ONOFF_TO_OFF:
        relay_cluster_off(cluster);
        break;

    case ZCL_START_UP_ONOFF_SET_ONOFF_TO_ON:
        relay_cluster_on(cluster);
        break;

    case ZCL_START_UP_ONOFF_SET_ONOFF_TOGGLE:
        if (prev_on) {
            relay_cluster_off(cluster);
        } else {
            relay_cluster_on(cluster);
        }
        break;

    case ZCL_START_UP_ONOFF_SET_ONOFF_TO_PREVIOUS:
        if (prev_on) {
            relay_cluster_on(cluster);
        } else {
            relay_cluster_off(cluster);
        }
        break;
    }

    // Restore indicator LED state
    sync_indicator_led(cluster);
}
