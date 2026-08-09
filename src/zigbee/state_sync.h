#ifndef _STATE_SYNC_H_
#define _STATE_SYNC_H_

#include <stdint.h>

// Relay state delivery watchdog.
//
// The Zigbee stack reports attribute changes to the binding table without any
// end-to-end acknowledgement: if the report is lost on the way to the
// coordinator, nothing notices and Home Assistant keeps showing the old state
// until the next periodic report happens to get through. This module sends the
// relay state as an APS-acknowledged unicast to the coordinator and, when the
// acknowledgement does not arrive, retries with a backoff and finally escalates
// (re-announce, then rejoin) to repair the link.
//
// It also re-sends every relay state periodically, so a state that drifted for
// any reason converges within one heartbeat.

/** Register the delivery-confirmation callback. Call once at startup. */
void state_sync_init(void);

/** Start watching a relay endpoint (called while endpoints are being built). */
void state_sync_track_endpoint(uint8_t endpoint);

/** Queue a confirmed state report for one relay endpoint (state changed). */
void state_sync_relay_changed(uint8_t endpoint);

/** Queue a confirmed state report for every known relay endpoint. */
void state_sync_report_all(void);

/** Pump the watchdog: send, time out, retry, escalate. Call from app_task. */
void state_sync_task(void);

#endif
