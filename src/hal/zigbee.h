#ifndef _HAL_ZIGBEE_H_
#define _HAL_ZIGBEE_H_

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/** Zigbee attribute access permissions */
typedef enum {
    ATTR_READONLY,
    ATTR_WRITABLE,
} hal_attr_flags_t;

/** Command handler result (processed or delegate to default handler) */
typedef enum {
    HAL_ZIGBEE_CMD_PROCESSED,
    HAL_ZIGBEE_CMD_SKIPPED,
    HAL_ZIGBEE_INVALID_VALUE,
    HAL_ZIGBEE_MALFORMED_COMMAND,
    HAL_ZIGBEE_ACTION_DENIED,
} hal_zigbee_cmd_result_t;

/** Zigbee network connection state */
typedef enum {
    HAL_ZIGBEE_NETWORK_NOT_JOINED = 0,
    HAL_ZIGBEE_NETWORK_JOINED     = 1,
    HAL_ZIGBEE_NETWORK_JOINING    = 2,
} hal_zigbee_network_status_t;

/** Zigbee cluster attribute definition (readable/writable device properties) */
typedef struct {
    uint16_t         attribute_id;
    uint8_t          data_type_id;
    hal_attr_flags_t flag;
    uint8_t          size;
    uint8_t *        value;
} hal_zigbee_attribute;

/** Function called when cluster receives a command */
typedef hal_zigbee_cmd_result_t (*hal_zigbee_cmd_callback_t)(
    uint8_t endpoint, uint16_t cluster_id, uint8_t command_id,
    void *cmd_payload, uint16_t cmd_payload_len);

/** Zigbee cluster (group of related attributes and commands) */
typedef struct {
    uint16_t                  cluster_id;
    uint8_t                   is_server;
    uint8_t                   attribute_count;
    hal_zigbee_attribute *    attributes;
    hal_zigbee_cmd_callback_t cmd_callback;
} hal_zigbee_cluster;

/** Zigbee endpoint (logical device with multiple clusters) */
typedef struct {
    uint8_t             endpoint;
    uint16_t            profile_id;
    uint16_t            device_id;
    uint8_t             device_version;

    uint8_t             cluster_count;
    hal_zigbee_cluster *clusters;
} hal_zigbee_endpoint;

/**
 * Initialize Zigbee stack with device endpoints and clusters
 * @param endpoints Array of endpoint definitions
 * @param endpoints_cnt Number of endpoints
 */
void hal_zigbee_init(hal_zigbee_endpoint *endpoints, uint8_t endpoints_cnt);

// Network membership control

/**
 * Get current Zigbee network connection status
 * @return Network status (joined/joining/not joined)
 */
hal_zigbee_network_status_t hal_zigbee_get_network_status(void);

/**
 * Get the source network address of the Zigbee command currently being
 * dispatched to a cluster command callback. Returns 0x0000 for the coordinator
 * (Home Assistant / zigbee2mqtt). A non-zero value means the command came from
 * another device (e.g. a peer switch via a direct binding). Only meaningful
 * while inside a command callback.
 */
uint16_t hal_zigbee_get_current_command_source(void);

/**
 * Returns true if the command currently being dispatched arrived as a
 * groupcast (multicast to a Zigbee group) rather than a unicast. Only
 * meaningful while inside a command callback. Used to avoid re-broadcasting a
 * change that every group member already received directly.
 */
bool hal_zigbee_get_current_command_is_groupcast(void);

/** Function called when network status changes */
typedef void (*hal_network_status_change_callback_t)(
    hal_zigbee_network_status_t new_status);

/**
 * Register callback for network status changes
 * @param callback Function to call on status change
 */
void hal_register_on_network_status_change_callback(
    hal_network_status_change_callback_t callback);

/** Leave current Zigbee network */
void hal_zigbee_leave_network(void);

/** Start searching for and joining Zigbee networks (pairing mode) */
void hal_zigbee_start_network_steering(void);

/** Set Zigbee OTA image type */
void hal_zigbee_set_image_type(uint16_t image_type);

// Attributes

/**
 * Notify SDK that attribute value changed (for example, trigger reporting)
 * @param endpoint Endpoint number
 * @param cluster_id Cluster ID
 * @param attribute_id Attribute ID that changed
 */
void hal_zigbee_notify_attribute_changed(uint8_t endpoint, uint16_t cluster_id,
                                         uint16_t attribute_id);

/** Function called when attribute is written via Zigbee */
typedef void (*hal_attribute_change_callback_t)(uint8_t endpoint,
                                                uint16_t cluster_id,
                                                uint16_t attribute_id);

/**
 * Register callback for attribute changes from network
 * @param callback Function to call when attributes are written
 */
void hal_zigbee_register_on_attribute_change_callback(
    hal_attribute_change_callback_t callback);

/** Zigbee command direction (client sends commands, server responds) */
typedef enum {
    HAL_ZIGBEE_DIR_CLIENT_TO_SERVER = 0,
    HAL_ZIGBEE_DIR_SERVER_TO_CLIENT = 1,
} hal_zigbee_direction_t;

typedef struct {
    uint8_t                endpoint;            // source endpoint
    uint16_t               profile_id;          // e.g., 0x0104 (HA)
    uint16_t               cluster_id;          // e.g., 0x0006 (On/Off)
    uint8_t                command_id;          // ZCL command id
    uint8_t                cluster_specific;    // 1 = cluster-specific, 0 = global
    hal_zigbee_direction_t direction;
    uint8_t                disable_default_rsp; // 1 = set “disable default response”
    uint16_t               manufacturer_code;   // 0 if not manufacturer-specific
    const uint8_t *        payload;             // raw payload (little-endian encoded)
    uint8_t                payload_len;
} hal_zigbee_cmd;

/** Zigbee operation result codes (success or failure reasons) */
typedef enum {
    HAL_ZIGBEE_OK = 0,
    HAL_ZIGBEE_ERR_NOT_JOINED,
    HAL_ZIGBEE_ERR_BAD_ARG,
    HAL_ZIGBEE_ERR_SEND_FAILED,
} hal_zigbee_status_t;

/**
 * Send command to bound devices (switches controlling lights)
 * @param cmd Command structure to send
 * @return HAL_ZIGBEE_OK on success, error code otherwise
 */
hal_zigbee_status_t hal_zigbee_send_cmd_to_bindings(const hal_zigbee_cmd *cmd);

/**
 * Add an endpoint to a Zigbee group, so it receives groupcasts to that group.
 * @param endpoint Endpoint to add (e.g. a relay endpoint)
 * @param group_id Group address
 */
void hal_zigbee_group_add(uint8_t endpoint, uint16_t group_id);

/** Remove an endpoint from a Zigbee group. */
void hal_zigbee_group_remove(uint8_t endpoint, uint16_t group_id);

/**
 * Create a local binding from an endpoint+cluster to a Zigbee group, so
 * commands that endpoint sends to its bindings reach the whole group.
 * @param endpoint Source endpoint (e.g. a button endpoint)
 * @param cluster_id Cluster to bind (e.g. genOnOff)
 * @param group_id Destination group address
 */
void hal_zigbee_bind_to_group(uint8_t endpoint, uint16_t cluster_id,
                              uint16_t group_id);

/** Remove a local endpoint+cluster -> group binding. */
void hal_zigbee_unbind_from_group(uint8_t endpoint, uint16_t cluster_id,
                                  uint16_t group_id);

/**
 * Send attribute report to bound devices (notify of state changes)
 * @param endpoint Source endpoint
 * @param cluster_id Cluster containing the attribute
 * @param attr_id Attribute ID to report
 * @param zcl_type_id ZCL data type of the value
 * @param value Pointer to attribute value
 * @param value_len Size of value in bytes
 * @return HAL_ZIGBEE_OK on success, error code otherwise
 */
hal_zigbee_status_t
hal_zigbee_send_report_attr(uint8_t endpoint, uint16_t cluster_id,
                            uint16_t attr_id, uint8_t zcl_type_id,
                            const void *value, uint8_t value_len);

/**
 * Send an attribute report to the coordinator as an APS-ACKNOWLEDGED unicast.
 *
 * Unlike hal_zigbee_send_report_attr() (and the stack's own periodic
 * reporting), which are fire-and-forget to whatever is in the binding table,
 * this asks the APS layer for an end-to-end acknowledgement from the
 * coordinator. The result is delivered asynchronously through the callback
 * registered with hal_zigbee_register_on_delivery_confirm_callback(), so the
 * application can retry a report that Home Assistant / zigbee2mqtt never got.
 *
 * @param endpoint Source endpoint
 * @param cluster_id Cluster containing the attribute
 * @param attr_id Attribute ID to report
 * @return HAL_ZIGBEE_OK if the report was handed to the stack
 */
hal_zigbee_status_t hal_zigbee_send_report_attr_confirmed(uint8_t  endpoint,
                                                          uint16_t cluster_id,
                                                          uint16_t attr_id);

/**
 * Function called when a message sent from `endpoint` for `cluster_id` is
 * confirmed (or fails) by the APS layer. `success` is true only when the
 * destination acknowledged it end-to-end.
 */
typedef void (*hal_zigbee_delivery_callback_t)(uint8_t endpoint,
                                               uint16_t cluster_id,
                                               bool     success);

/** Register callback for APS delivery confirmations */
void hal_zigbee_register_on_delivery_confirm_callback(
    hal_zigbee_delivery_callback_t callback);

/**
 * Ask the stack to rejoin the network it is already provisioned for (keeps the
 * network key and IEEE address, so the device stays the same in HA). Used as a
 * last resort when the device believes it is joined but the coordinator no
 * longer answers.
 */
void hal_zigbee_request_rejoin(void);

/** Send Zigbee "announce" command to notify other devices of our presence
 * @return HAL_ZIGBEE_OK on success, error code otherwise
 */
hal_zigbee_status_t hal_zigbee_send_announce(void);


/** Function called when any ZCL command is received, both generic and cluster-specific */
typedef void (*hal_zcl_activity_callback_t)();

/**
 * Register callback for ZCL activity from network
 * @param callback Function to call when ZCL commands are received
 *
 * Idea is to use this for battery device to control polling rate after incoming messages.
 */
void hal_zigbee_register_on_zcl_activity_callback(
    hal_zcl_activity_callback_t callback);


/** Set end device poll rate in milliseconds
 *
 * No-op for routers.
 */
void hal_zigbee_set_poll_rate_ms(uint32_t poll_rate_ms);

/** Get current end device poll rate in milliseconds
 *
 * Returns 0 for routers.
 */
uint32_t hal_zigbee_get_poll_rate_ms(void);

/** Find cluster definition by endpoint and cluster ID */
static inline hal_zigbee_cluster *
hal_zigbee_find_cluster(hal_zigbee_endpoint *endpoints, uint8_t endpoints_count,
                        uint8_t endpoint, uint16_t cluster_id) {
    if (!endpoints) {
        return NULL;
    }

    for (int i = 0; i < endpoints_count; i++) {
        if (endpoints[i].endpoint == endpoint) {
            for (int j = 0; j < endpoints[i].cluster_count; j++) {
                if (endpoints[i].clusters[j].cluster_id == cluster_id) {
                    return &endpoints[i].clusters[j];
                }
            }
        }
    }
    return NULL;
}

/** Find attribute definition within a specific cluster */
static inline hal_zigbee_attribute *
hal_zigbee_find_attribute(hal_zigbee_endpoint *endpoints,
                          uint8_t endpoints_count, uint8_t endpoint,
                          uint16_t cluster_id, uint16_t attribute_id) {
    hal_zigbee_cluster *cluster =
        hal_zigbee_find_cluster(endpoints, endpoints_count, endpoint, cluster_id);

    if (!cluster) {
        return NULL;
    }

    for (int i = 0; i < cluster->attribute_count; i++) {
        if (cluster->attributes[i].attribute_id == attribute_id) {
            return &cluster->attributes[i];
        }
    }
    return NULL;
}

#endif
