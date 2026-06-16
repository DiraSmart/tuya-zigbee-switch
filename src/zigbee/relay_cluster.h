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
    hal_zigbee_attribute attr_infos[4];
    relay_t *            relay;
    led_t *              indicator_led;
    uint8_t              indicator_state;
    // Last relay state propagated to bindings. Used as an anti-loop guard for
    // the 3-way mirror: we only forward to bindings on a real state transition,
    // so a mirrored command bouncing back (already in that state) stops here.
    uint8_t              mirror_last_state;
} zigbee_relay_cluster;

void relay_cluster_add_to_endpoint(zigbee_relay_cluster *cluster,
                                   hal_zigbee_endpoint *endpoint);

void relay_cluster_on(zigbee_relay_cluster *cluster);
void relay_cluster_off(zigbee_relay_cluster *cluster);
void relay_cluster_toggle(zigbee_relay_cluster *cluster);

void relay_cluster_report(zigbee_relay_cluster *cluster);
void report_all_relay_states();

void update_relay_clusters();

void relay_cluster_callback_attr_write_trampoline(uint8_t endpoint,
                                                  uint16_t attribute_id);

#endif
