#include "state_sync.h"
#include "consts.h"
#include "hal/printf_selector.h"
#include "hal/timer.h"
#include "hal/zigbee.h"
#include <stdbool.h>

// Endpoint numbers used by relays stay small (2*N, N <= 3), and
// relay_cluster_by_endpoint[] is sized the same way.
#define STATE_SYNC_MAX_ENDPOINTS 10

// How long to wait for the APS acknowledgement before treating the report as
// lost. The APS layer already retries internally within this window.
#define ACK_TIMEOUT_MS           6000

// Backoff between our own retries of a report that was not acknowledged.
static const uint32_t retry_backoff_ms[] = {3000, 8000, 20000, 45000};
#define MAX_ATTEMPTS             5

// Every relay re-reports its state at least this often, even when nothing
// changed, so Home Assistant converges on the real state after any hiccup.
#define HEARTBEAT_MS             60000

// Relays of the same device do not all report on the same tick.
#define STAGGER_MS               2500

// Escalation ladder, counted in consecutive failed report cycles (each cycle is
// MAX_ATTEMPTS acknowledged sends, so roughly a minute and a half of silence).
#define ANNOUNCE_AFTER_FAILURES  1
#define REJOIN_AFTER_FAILURES    3
#define REJOIN_MIN_GAP_MS        (10u * 60u * 1000u)

typedef struct {
    bool     tracked;      // an endpoint we report for
    bool     pending;      // state still waiting to be acknowledged
    uint8_t  attempts;     // sends made in the current cycle
    uint32_t next_send_ms; // when the next (re)send is due
} sync_entry_t;

static sync_entry_t entries[STATE_SYNC_MAX_ENDPOINTS];

// Only one report is in flight at a time: the delivery confirmation carries no
// tag of its own, so keeping a single outstanding send is what makes it
// unambiguous.
static uint8_t  in_flight_ep      = 0;
static uint32_t in_flight_sent_ms = 0;

// Written by the stack's confirmation callback, consumed by state_sync_task().
static volatile bool    confirm_ready = false;
static volatile uint8_t confirm_ep    = 0;
static volatile bool    confirm_ok    = false;

static uint8_t  consecutive_failures = 0;
static uint32_t last_rejoin_ms       = 0;
static bool     rejoin_ever_requested = false;

static bool endpoint_valid(uint8_t endpoint) {
    return endpoint > 0 && endpoint < STATE_SYNC_MAX_ENDPOINTS;
}

// A confirmation only tells us the endpoint and cluster of the frame that was
// acknowledged, so any genOnOff traffic from the relay endpoint (our report, a
// default response, a read response) can produce it. That is fine: what we are
// really measuring is whether frames from this endpoint reach the coordinator.
static void on_delivery_confirm(uint8_t endpoint, uint16_t cluster_id,
                                bool success) {
    if (cluster_id != ZCL_CLUSTER_ON_OFF || in_flight_ep == 0 ||
        endpoint != in_flight_ep) {
        return;
    }
    confirm_ep    = endpoint;
    confirm_ok    = success;
    confirm_ready = true;
}

void state_sync_init(void) {
    hal_zigbee_register_on_delivery_confirm_callback(on_delivery_confirm);
}

void state_sync_track_endpoint(uint8_t endpoint) {
    static uint8_t tracked_count = 0;

    if (!endpoint_valid(endpoint) || entries[endpoint].tracked) {
        return;
    }
    entries[endpoint].tracked = true;
    // Spread the first heartbeat of each relay so a multi-gang device does not
    // send all its reports on the same tick.
    entries[endpoint].next_send_ms = hal_millis() + tracked_count * STAGGER_MS;
    tracked_count++;
}

void state_sync_relay_changed(uint8_t endpoint) {
    if (!endpoint_valid(endpoint) || !entries[endpoint].tracked) {
        return;
    }
    sync_entry_t *entry = &entries[endpoint];

    entry->pending      = true;
    entry->attempts     = 0;
    entry->next_send_ms = hal_millis();
}

void state_sync_report_all(void) {
    uint32_t now      = hal_millis();
    uint8_t  reported = 0;

    for (uint8_t ep = 1; ep < STATE_SYNC_MAX_ENDPOINTS; ep++) {
        if (!entries[ep].tracked) {
            continue;
        }
        entries[ep].pending      = true;
        entries[ep].attempts     = 0;
        entries[ep].next_send_ms = now + reported * STAGGER_MS;
        reported++;
    }
}

// Called when a report cycle exhausted its retries: the coordinator is not
// answering. Refresh our presence first, and only rejoin if that keeps failing.
static void escalate(void) {
    uint32_t now = hal_millis();

    consecutive_failures++;
    printf("State report unacknowledged (%d cycles)\r\n", consecutive_failures);

    if (consecutive_failures >= ANNOUNCE_AFTER_FAILURES) {
        // Refreshes the coordinator's address map and gives the network layer a
        // reason to discover a new route.
        hal_zigbee_send_announce();
    }

    if (consecutive_failures >= REJOIN_AFTER_FAILURES &&
        (!rejoin_ever_requested ||
         (uint32_t)(now - last_rejoin_ms) >= REJOIN_MIN_GAP_MS)) {
        // Joined as far as the stack is concerned, but nothing we send is
        // getting through. Rejoin keeps the network key and the IEEE address,
        // so the device stays the same one in Home Assistant.
        printf("Link looks dead, requesting rejoin\r\n");
        hal_zigbee_request_rejoin();
        last_rejoin_ms        = now;
        rejoin_ever_requested = true;
    }
}

static void finish_cycle(uint8_t endpoint, bool success) {
    sync_entry_t *entry = &entries[endpoint];

    in_flight_ep = 0;

    if (success) {
        entry->pending      = false;
        entry->attempts     = 0;
        entry->next_send_ms = hal_millis() + HEARTBEAT_MS;
        consecutive_failures = 0;
        return;
    }

    if (entry->attempts < MAX_ATTEMPTS) {
        uint8_t idx = entry->attempts - 1;

        if (idx >= sizeof(retry_backoff_ms) / sizeof(retry_backoff_ms[0])) {
            idx = sizeof(retry_backoff_ms) / sizeof(retry_backoff_ms[0]) - 1;
        }
        entry->next_send_ms = hal_millis() + retry_backoff_ms[idx];
        return;
    }

    // Out of retries for now. Keep the report pending so the next heartbeat
    // tries again: the state must eventually reach Home Assistant.
    entry->attempts     = 0;
    entry->next_send_ms = hal_millis() + HEARTBEAT_MS;
    escalate();
}

void state_sync_task(void) {
    uint32_t now = hal_millis();

    if (hal_zigbee_get_network_status() != HAL_ZIGBEE_NETWORK_JOINED) {
        // Nothing to confirm while off the network; app_task drives rejoining.
        in_flight_ep  = 0;
        confirm_ready = false;
        return;
    }

    if (confirm_ready) {
        uint8_t ep   = confirm_ep;
        bool    ok   = confirm_ok;

        confirm_ready = false;
        if (endpoint_valid(ep)) {
            finish_cycle(ep, ok);
        }
    }

    if (in_flight_ep != 0) {
        if ((uint32_t)(now - in_flight_sent_ms) < ACK_TIMEOUT_MS) {
            return; // still waiting for the acknowledgement
        }
        finish_cycle(in_flight_ep, false);
        return;
    }

    for (uint8_t ep = 1; ep < STATE_SYNC_MAX_ENDPOINTS; ep++) {
        sync_entry_t *entry = &entries[ep];

        if (!entry->tracked) {
            continue;
        }
        // A relay that is up to date still re-reports on the heartbeat.
        if (!entry->pending && (int32_t)(now - entry->next_send_ms) >= 0) {
            entry->pending  = true;
            entry->attempts = 0;
        }
        if (!entry->pending || (int32_t)(now - entry->next_send_ms) < 0) {
            continue;
        }

        entry->attempts++;
        // Marked in flight before sending: a HAL whose confirmation is
        // synchronous (the test stub) would otherwise be discarded.
        in_flight_ep      = ep;
        in_flight_sent_ms = now;
        if (hal_zigbee_send_report_attr_confirmed(ep, ZCL_CLUSTER_ON_OFF,
                                                  ZCL_ATTR_ONOFF) !=
            HAL_ZIGBEE_OK) {
            confirm_ready = false;
            finish_cycle(ep, false);
        }
        return; // one report in flight at a time
    }
}
