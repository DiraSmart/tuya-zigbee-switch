#include "device_params_nv.h"
#include "hal/nvm.h"
#include "nvm_items.h"

uint8_t  g_multi_press_reset_count = 10;
uint8_t  g_child_lock_enabled      = 0;
uint8_t  g_child_lock_active       = 0;
uint16_t g_sync_group_id           = 0;

void device_params_load_from_nv(void) {
    uint8_t          value;
    hal_nvm_status_t st;

    st = hal_nvm_read(NV_ITEM_MULTI_PRESS_RESET_COUNT, sizeof(value),
                      (uint8_t *)&value);
    if (st == HAL_NVM_SUCCESS) {
        g_multi_press_reset_count = value;
    }

    st = hal_nvm_read(NV_ITEM_CHILD_LOCK_ENABLED, sizeof(value),
                      (uint8_t *)&value);
    if (st == HAL_NVM_SUCCESS) {
        g_child_lock_enabled = value;
    }

    st = hal_nvm_read(NV_ITEM_CHILD_LOCK_ACTIVE, sizeof(value),
                      (uint8_t *)&value);
    if (st == HAL_NVM_SUCCESS) {
        g_child_lock_active = value;
    }

    uint16_t group_id;
    st = hal_nvm_read(NV_ITEM_SYNC_GROUP_ID, sizeof(group_id),
                      (uint8_t *)&group_id);
    if (st == HAL_NVM_SUCCESS) {
        g_sync_group_id = group_id;
    }
}

void device_params_set_multi_press_reset_count(uint8_t value) {
    g_multi_press_reset_count = value;
    hal_nvm_write(NV_ITEM_MULTI_PRESS_RESET_COUNT, sizeof(value),
                  (uint8_t *)&value);
}

void device_params_set_child_lock_enabled(uint8_t value) {
    g_child_lock_enabled = value;
    hal_nvm_write(NV_ITEM_CHILD_LOCK_ENABLED, sizeof(value), (uint8_t *)&value);
}

void device_params_set_child_lock_active(uint8_t value) {
    g_child_lock_active = value;
    hal_nvm_write(NV_ITEM_CHILD_LOCK_ACTIVE, sizeof(value), (uint8_t *)&value);
}

void device_params_set_sync_group_id(uint16_t value) {
    g_sync_group_id = value;
    hal_nvm_write(NV_ITEM_SYNC_GROUP_ID, sizeof(value), (uint8_t *)&value);
}
