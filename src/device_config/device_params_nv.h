#ifndef DEVICE_CONFIG_DEVICE_PARAMS_NV_H_
#define DEVICE_CONFIG_DEVICE_PARAMS_NV_H_

#include <stdint.h>

/*
 * Global device parameter: multi-press reset count.
 *   0  => multi-press factory reset disabled
 *   N  => factory-reset after N consecutive presses
 * Default: 10, persisted in NVM.
 */

extern uint8_t g_multi_press_reset_count;

/*
 * Global (whole-device) child lock:
 *   g_child_lock_enabled : master switch for the feature (default 0 = off)
 *   g_child_lock_active  : current lock state (default 0 = unlocked)
 * When active, no physical button toggles its relay. Both persisted in NVM.
 */
extern uint8_t g_child_lock_enabled;
extern uint8_t g_child_lock_active;

/*
 * Global 3-way sync group: when non-zero, the firmware automatically joins its
 * relay endpoint(s) to this Zigbee group (to receive) and binds its button
 * endpoint(s) genOnOff to this group (to send). Lets a multi-way setup be
 * configured with a single number per device instead of manual group
 * membership + bindings. 0 = disabled. Persisted in NVM.
 */
extern uint16_t g_sync_group_id;

void device_params_load_from_nv(void);
void device_params_set_multi_press_reset_count(uint8_t value);
void device_params_set_child_lock_enabled(uint8_t value);
void device_params_set_child_lock_active(uint8_t value);
void device_params_set_sync_group_id(uint16_t value);

#endif /* DEVICE_CONFIG_DEVICE_PARAMS_NV_H_ */
