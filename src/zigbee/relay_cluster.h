#ifndef _RELAY_CLUSTER_H_
#define _RELAY_CLUSTER_H_

#include "base_components/led.h"
#include "base_components/relay.h"
#include <stdint.h>

#include "hal/zigbee.h"

typedef struct {
    uint8_t              relay_idx;
    uint8_t              endpoint;
    uint8_t              startup_mode;
    uint8_t              indicator_led_mode;
    hal_zigbee_attribute attr_infos[5];
    relay_t *            relay;
    led_t *              indicator_led;
    uint8_t              indicator_state;
    // Last relay state propagated to bindings. Used as an anti-loop guard for
    // the 3-way mirror: we only forward to bindings on a real state transition,
    // so a mirrored command bouncing back (already in that state) stops here.
    uint8_t              mirror_last_state;
    // Per-light 3-way sync group. When non-zero, this relay joins the Zigbee
    // group (to receive) and the button(s) controlling it bind genOnOff to it
    // (to send). 0 = disabled. Persisted in NVM. applied_* tracks what is
    // currently configured in hardware so a change can be cleaned up.
    uint16_t             sync_group_id;
    uint16_t             applied_sync_group_id;
} zigbee_relay_cluster;

void relay_cluster_add_to_endpoint(zigbee_relay_cluster *cluster,
                                   hal_zigbee_endpoint *endpoint);

void relay_cluster_on(zigbee_relay_cluster *cluster);
void relay_cluster_off(zigbee_relay_cluster *cluster);
void relay_cluster_toggle(zigbee_relay_cluster *cluster);

void relay_cluster_report(zigbee_relay_cluster *cluster);
void report_all_relay_states();

// Apply each relay's per-light 3-way sync group: a relay with a non-zero
// sync_group_id joins that Zigbee group and the button(s) controlling it bind
// genOnOff to it; a previously applied group is removed on change. Called on
// boot (after join) and when a relay's sync group id is written.
void sync_group_apply(void);

// When set, a relay state change does NOT mirror to the controlling button's
// bindings. The switch sets this while driving the relay from a local button
// press, because the button's own binding_action already propagates the change
// to 3-way targets (mirroring again would send the command twice).
extern bool relay_cluster_mirror_suppressed;

void update_relay_clusters();

void relay_cluster_callback_attr_write_trampoline(uint8_t endpoint,
                                                  uint16_t attribute_id);

#endif
