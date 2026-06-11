const {
    numeric,
    enumLookup,
    deviceEndpoints,
    onOff,
    text,
    binary,
    windowCovering,
    deviceAddCustomCluster,
} = require("zigbee-herdsman-converters/lib/modernExtend");
const {assertString} = require("zigbee-herdsman-converters/lib/utils");
const reporting = require("zigbee-herdsman-converters/lib/reporting");
const constants = require("zigbee-herdsman-converters/lib/constants");
const Zcl = require('zigbee-herdsman').Zcl;
const e = require("zigbee-herdsman-converters/lib/exposes").presets;
const ea = require("zigbee-herdsman-converters/lib/exposes").access;
const ota = require("zigbee-herdsman-converters/lib/ota");

/********************************************************************
  This file (`switch_custom.js`) is generated. 
  
  You can edit it for testing, but for PRs please use:
  - `device_db.yaml`                - add or edit devices
  - `switch_custom.md.jinja`        - update the template
  - `make_z2m_custom_converters.py` - update generation script

  Generate with: `make tools/update_converters`
********************************************************************/

const romasku = {
    switchAction: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { toggle_simple: 2, toggle_smart_sync: 3 },
            cluster: "genOnOffSwitchCfg",
            attribute: {ID: 0x0010, type: 0x30, required: true, write: true, min: 0, max: 4}, // Enum8
            description: `Select how switch should work:
            - toggle_simple: Any press toggles the relay and sends TOGGLE to bound devices
            - toggle_smart_sync: Any press toggles the relay and sends ON/OFF to keep bound devices in sync (use for 3-way)`,
            entityCategory: "config",
        }),
    switchMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { toggle: 0, momentary: 1, momentary_nc: 2 },
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff00, type: 0x30 }, // Enum8
            description: "Select the type of switch connected to the device",
            entityCategory: "config",
        }),
    relayMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { detached: 0, press_start: 1, short_press: 3, long_press: 2},
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff01, type: 0x30 }, // Enum8
            description: "When to turn on/off internal relay",
            entityCategory: "config",
        }),
    childLock: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "genBasic",
            attribute: { ID: 0xff04, type: 0x10 }, // Boolean (whole-device child lock active)
            description: "Child lock (whole device): when ON, no physical button controls its relay",
            access: "ALL",
            entityCategory: "config",
        }),
    childLockEnabled: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "genBasic",
            attribute: { ID: 0xff03, type: 0x10 }, // Boolean
            description: "Enable the child lock feature (off by default). When enabled, 5 quick presses on any button toggle the lock.",
            access: "ALL",
            entityCategory: "config",
        }),
    decouple: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 0],   // 0 = detached -> virtual button (does not drive its relay)
            valueOff: ["OFF", 3], // 3 = short_press -> normal (drives its relay)
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff01, type: 0x30 }, // Enum8 (relay_mode)
            description: "Decouple: when ON the button does not control its relay (virtual button for scenes/covers via the press_action sensor)",
            access: "ALL",
            entityCategory: "config",
        }),
    // General (whole-device) power-on behavior: one control that writes
    // startUpOnOff to every relay endpoint.
    generalPowerOnBehavior: (name, relayEndpoints) => {
        const lookup = {off: 0, on: 1, toggle: 2, previous: 255};
        return {
            exposes: [e.enum(name, ea.STATE_SET, Object.keys(lookup))
                .withDescription("Power-on behavior applied to all relays")
                .withCategory("config")],
            toZigbee: [{
                key: [name],
                convertSet: async (entity, key, value, meta) => {
                    for (const ep of relayEndpoints) {
                        await meta.device.getEndpoint(ep).write("genOnOff", {16387: {value: lookup[value], type: 0x30}});
                    }
                    return {state: {[name]: value}};
                },
            }],
            isModernExtend: true,
        };
    },
    // General (whole-device) relay indicator LED mode: one control that writes
    // the indicator mode to every relay endpoint.
    generalIndicatorMode: (name, relayEndpoints) => {
        const lookup = {relay: 0, opposite: 1, off: 3};
        return {
            exposes: [e.enum(name, ea.STATE_SET, Object.keys(lookup))
                .withDescription("Indicator LED (all relays): relay=on with light, opposite=on when off, off=always off")
                .withCategory("config")],
            toZigbee: [{
                key: [name],
                convertSet: async (entity, key, value, meta) => {
                    for (const ep of relayEndpoints) {
                        await meta.device.getEndpoint(ep).write("genOnOff", {65281: {value: lookup[value], type: 0x30}});
                    }
                    return {state: {[name]: value}};
                },
            }],
            isModernExtend: true,
        };
    },
    relayIndex: (name, endpointName, relay_cnt) =>
        enumLookup({
            name,
            endpointName,
            lookup: Object.fromEntries(
                Array.from({ length: relay_cnt || 2 }, (_, i) => [`relay_${i + 1}`, i + 1])
            ),
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff02, type: 0x20 }, // uint8
            description: "Which internal relay it should trigger",
            entityCategory: "config",
        }),
    bindedMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { press_start: 1, short_press: 3, long_press: 2},
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff05, type: 0x30 }, // Enum8
            description: "When turn on/off binded device",
            entityCategory: "config",
        }),
    longPressDuration: (name, endpointName) =>
        numeric({
            name,
            endpointNames: [endpointName],
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff03, type: 0x21 }, // uint16
            description: "Hold duration in ms to trigger factory reset / re-pair (default 6000)",
            valueMin: 0,
            valueMax: 10000,
            entityCategory: "config",
        }),
    levelMoveRate: (name, endpointName) =>
        numeric({
            name,
            endpointNames: [endpointName],
            cluster: "genOnOffSwitchCfg",
            attribute: { ID: 0xff04, type: 0x20 }, // uint8
            description: "Level (dim) move rate in steps per ms",
            valueMin: 1,
            valueMax: 255,
            entityCategory: "config",
        }),
    pressAction: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            access: "STATE_GET",
            lookup: { released: 0, press: 1, long_press: 2, position_on: 3, position_off: 4 },
            cluster: "genMultistateInput",
            attribute: "presentValue",
            description: "Action of the switch: 'released' or 'press' or 'long_press'",
            entityCategory: "diagnostic",
        }),
    relayIndicatorMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { relay: 0, opposite: 1, off: 3 },
            cluster: "genOnOff",
            attribute: { ID: 0xff01, type: 0x30 }, // Enum8
            description: "Indicator LED: relay = ON when light is on, opposite = ON when light is off, off = always off",
            entityCategory: "config",
        }),
    relayIndicator: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "genOnOff",
            attribute: {ID: 0xff02, type: 0x10},  // Boolean
            description: "State of the relay indicator LED",
            access: "ALL",
            entityCategory: "config",
        }),
    batteryPercentage: () => {
        const result = numeric({
            name: "battery",
            cluster: "genPowerCfg",
            attribute: "batteryPercentageRemaining",
            description: "Remaining battery in %",
            valueMin: 0,
            valueMax: 100,
            unit: "%",
            access: "STATE_GET",
            entityCategory: "diagnostic",
        });
        // Patch fromZigbee to convert ZCL 0-200 to 0-100%
        const origConvert = result.fromZigbee[0].convert;
        result.fromZigbee[0].convert = (model, msg, publish, options, meta) => {
            const r = origConvert(model, msg, publish, options, meta);
            if (r && r.battery !== undefined) {
                r.battery = Math.round(r.battery / 2);
            }
            return r;
        };
        return result;
    },
    networkIndicator: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "genBasic",
            attribute: {ID: 0xff01, type: 0x10},  // Boolean
            description: "State of the network indicator LED",
            access: "ALL",
            entityCategory: "config",
        }),
    multiPressResetCount: (name, endpointName) =>
        numeric({
            name,
            endpointNames: [endpointName],
            cluster: "genBasic",
            attribute: { ID: 0xff02, type: 0x20 }, // uint8
            description: "Number of consecutive presses to trigger factory reset (0 = disabled)",
            valueMin: 0,
            valueMax: 255,
            entityCategory: "config",
        }),
    deviceConfig: (name, endpointName) =>
        text({
            name,
            endpointName,
            access: "ALL",
            cluster: "genBasic",
            attribute:  { ID: 0xff00, type: 0x44 }, // long str
            description: "Current configuration of the device",
            zigbeeCommandOptions: {timeout: 30_000},
            validate: (value) => {
                assertString(value);
                
                const validatePin = (pin) => {
                    const validPins = [
                        "A0", "A1", "A2", "A3", "A4", "A5", "A6","A7",
                        "B0", "B1", "B2", "B3", "B4", "B5", "B6","B7",
                        "C0", "C1", "C2", "C3", "C4", "C5", "C6","C7",
                        "D0", "D1", "D2", "D3", "D4", "D5", "D6","D7",
                    ];
                    if (!validPins.includes(pin)) throw new Error(`Pin ${pin} is invalid`);
                }

                if (value.length > 256) throw new Error('Length of config is greater than 256');
                if (!value.endsWith(';')) throw new Error('Should end with ;');
                const parts = value.slice(0, -1).split(';');  // Drop last ;
                if (parts.length < 2) throw new Error("Model and/or manufacturer missing");
                for (const part of parts.slice(2)) {
                    if (part == 'SLP') {
                        continue;   
                    } else if (part[0] == 'D') {
                        if (!/^D\d+$/.test(part)) {
                            throw new Error(`Debounce option ${part} is invalid. Use D<N>, e.g. D100 or D0`);
                        }
                    } else if (part.startsWith('BT')) {
                        validatePin(part.slice(2,4));
                    } else if (part[0] == 'B' || part[0] == 'S') {
                        validatePin(part.slice(1,3));
                        if (!["u", "U", "d", "f"].includes(part[3])) {
                            throw new Error(`Pull up down ${part[3]} is invalid. Valid options are u, U, d, f`);
                        } 
                    } else if (part[0] == 'X') {
                        validatePin(part.slice(1,3));
                        validatePin(part.slice(3,5));
                        if (!["u", "U", "d", "f"].includes(part[5])) {
                            throw new Error(`Pull up down ${part[5]} is invalid. Valid options are u, U, d, f`);
                        }
                    } else if (part[0] == 'C') {
                        validatePin(part.slice(1,3));
                        validatePin(part.slice(3,5));
                    } else if (part[0] == 'L' || part[0] == 'R' || part[0] == 'I') {
                        validatePin(part.slice(1,3));
                    } else if(part[0] == 'M') {
                        ;
                    } else if(part[0] == 'i') {
                        ; // TODO: write validation
                    } else {
                        throw new Error(`Invalid entry ${part}. Should start with one of B, BT, C, D, I, L, M, R, S, SLP, X, i`);
                    }
                }
            },
            entityCategory: "config",
        }),
    coverSwitchPressAction: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            access: "STATE_GET",
            lookup: { 
                released: 0, 
                open: 1, 
                close: 2,
                stop: 3,
                long_open: 4,
                long_close: 5
            },
            cluster: "genMultistateInput",
            attribute: "presentValue",
            description: "Cover switch button press action",
            entityCategory: "diagnostic"
        }),
    coverSwitchType: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { toggle: 0, momentary: 1 },
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "switchType",
            description: "Type of cover switch: toggle (rocker) or momentary (push button)",
            entityCategory: "config",
        }),
    coverSwitchCoverIndex: (name, endpointName, output_cnt) =>
        enumLookup({
            name,
            endpointName,
            lookup: Object.fromEntries([
                ['detached', 0],
                ...Array.from({ length: output_cnt || 2 }, (_, i) => [`cover_${i + 1}`, i + 1])
            ]),
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "coverIndex",
            description: "Which cover to control locally (detached = no local control)",
            entityCategory: "config",
        }),
    coverSwitchInvert: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "reversal",
            description: "Inverts UP/DOWN direction for inputs",
            access: "ALL",
            entityCategory: "config",
        }),
    coverSwitchLocalMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { immediate: 0, short_press: 1, long_press: 2, hybrid: 3 },
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "localMode",
            description: "When to trigger local cover: immediate (start/stop on press), short_press (trigger on release), long_press (trigger after long press duration), hybrid (trigger on release or continuous movement while held). Only affects momentary switches",
            entityCategory: "config",
        }),
    coverSwitchBindedMode: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            lookup: { immediate: 0, short_press: 1, long_press: 2, hybrid: 3 },
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "bindedMode",
            description: "When to send commands to bound devices: immediate (start/stop on press), short_press (trigger on release), long_press (trigger after long press duration), hybrid (trigger on release or continuous movement while held). Only affects momentary switches",
            entityCategory: "config",
        }),
    coverSwitchLongPressDuration: (name, endpointName) =>
        numeric({
            name,
            endpointNames: [endpointName],
            cluster: "manuSpecificTuyaCoverSwitchConfig",
            attribute: "longPressDuration",
            description: "Threshold in milliseconds to distinguish short press from long press",
            valueMin: 0,
            valueMax: 5000,
            entityCategory: "config",
        }),
    coverMoving: (name, endpointName) =>
        enumLookup({
            name,
            endpointName,
            access: "STATE_GET",
            lookup: {
                stopped: 0,
                opening: 1,
                closing: 2
            },
            cluster: "closuresWindowCovering",
            attribute: "moving",
            description: "Cover movement status",
            entityCategory: "diagnostic",
        }),
    coverMotorReversal: (name, endpointName) =>
        binary({
            name,
            endpointName,
            valueOn: [true, 1],
            valueOff: [false, 0],
            cluster: "closuresWindowCovering",
            attribute: "motorReversal",
            description: "Reverse motor direction (swap OPEN/CLOSE relays)",
            entityCategory: "config",
        }),
};

const definitions = [
    {
        zigbeeModel: [
            "DS-ZB-001-v2",
        ],
        model: "DS-ZB-001-v2",
        vendor: "DiraSmart",
        description: "DiraSmart 1-gang Zigbee (v2)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "DS-ZB-002-v2",
        ],
        model: "DS-ZB-002-v2",
        vendor: "DiraSmart",
        description: "DiraSmart 2-gang Zigbee (v2)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "DS-ZB-003-v2",
        ],
        model: "DS-ZB-003-v2",
        vendor: "DiraSmart",
        description: "DiraSmart 3-gang Zigbee (v2)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MC",
        ],
        model: "TYWB 4ch-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MC1",
        ],
        model: "TYWB 4ch-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MC2",
        ],
        model: "TYWB 4ch-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MC3",
        ],
        model: "TYWB 4ch-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Tuya-ZG-001",
        ],
        model: "ZG-001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-SC",
        ],
        model: "ZG-2002-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-SC",
        ],
        model: "ZG-2002-RF",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "DEV-ZTU2",
        ],
        model: "Zigbee_SoC_Board_V2_(ZTU)",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-TD",
        ],
        model: "TS011F_din_smart_relay",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "WHD02-Aubess",
            "WHD02-Aubess-ED",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-AUB",
        ],
        model: "TMZ02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-AUB",
        ],
        model: "TS0003_switch_module_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-custom",
        ],
        model: "TS0004_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-AVB",
            "TS0001-Avatto-custom",
            "TS0001-AV-CUS",
        ],
        model: "ZWSM16-1-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-AVB",
            "TS0002-Avatto-custom",
            "TS0002-AV-CUS",
        ],
        model: "ZWSM16-2-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-AVB",
            "TS0003-Avatto-custom",
            "TS0003-AV-CUS",
        ],
        model: "ZWSM16-3-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-AVB",
            "TS0004-Avatto-custom",
            "TS0004-AV-CUS",
        ],
        model: "ZWSM16-4-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-AVB2",
        ],
        model: "ZWSM16-3-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-AVB2",
        ],
        model: "ZWSM16-4-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-AV-DRY",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-avatto",
            "TS0011-avatto-ED",
        ],
        model: "LZWSM16-1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-avatto",
            "TS0012-avatto-ED",
        ],
        model: "LZWSM16-2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-AVB1",
        ],
        model: "LZWSM16-2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0013-AVB",
        ],
        model: "LZWSM16-3",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "EKAC-T3092Z-CUSTOM",
        ],
        model: "EKAC-T3092Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-EKF",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-GS",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-GS",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-NS",
        ],
        model: "L13Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-FL",
            "TS0002-FL",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-GRA",
            "TS0003-GR",
        ],
        model: "TS0003_switch_module_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-GRA",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-C",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-GD",
        ],
        model: "TS0001_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-GIR",
        ],
        model: "JR-ZDS01",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-GIR",
            "TS0002-custom",
        ],
        model: "TS0002_basic",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS130F-GIR",
        ],
        model: "TS130F_GIRIER",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceAddCustomCluster("manuSpecificTuyaCoverSwitchConfig", {
                ID: 0xFC01,
                manufacturerCode: 0x125D,
                attributes: {
                    switchType: {ID: 0x0000, type: Zcl.DataType.ENUM8, write: true},
                    coverIndex: {ID: 0x0001, type: Zcl.DataType.UINT8, write: true},
                    reversal: {ID: 0x0002, type: Zcl.DataType.BOOLEAN, write: true},
                    localMode: {ID: 0x0003, type: Zcl.DataType.ENUM8, write: true},
                    bindedMode: {ID: 0x0004, type: Zcl.DataType.ENUM8, write: true},
                    longPressDuration: {ID: 0x0005, type: Zcl.DataType.UINT16, write: true},
                },
                commands: {},
                commandsResponse: {},
            }),
            deviceAddCustomCluster("closuresWindowCovering", {
                ID: 0x0102,
                attributes: {
                    moving: {ID: 0xff00, type: Zcl.DataType.ENUM8},
                    motorReversal: {ID: 0xff01, type: Zcl.DataType.BOOLEAN, write: true},
                },
            }),
            deviceEndpoints({ endpoints: {"cover_switch": 1, "cover": 2, } }),
            romasku.networkIndicator("network_led", "cover_switch"),
            windowCovering({ 
                controls: ["lift"],
                coverInverted: true,
                configureReporting: false,
                endpointNames: ["cover"]
            }),
            romasku.coverMoving("cover_moving", "cover"),
            romasku.coverMotorReversal("cover_motor_reversal", "cover"),
            romasku.coverSwitchPressAction("cover_switch_press_action", "cover_switch"),
            romasku.coverSwitchType("cover_switch_type", "cover_switch"),
            romasku.coverSwitchInvert("cover_switch_invert", "cover_switch"),
            romasku.coverSwitchCoverIndex("cover_switch_cover_index", "cover_switch", 1),
            romasku.coverSwitchLocalMode("cover_switch_local_mode", "cover_switch"),
            romasku.coverSwitchBindedMode("cover_switch_binded_mode", "cover_switch"),
            romasku.coverSwitchLongPressDuration("cover_switch_long_press_duration", "cover_switch"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {


            const coverSwitch1 = device.getEndpoint(1);
            await reporting.bind(coverSwitch1, coordinatorEndpoint, ["genMultistateInput"]);
            await coverSwitch1.configureReporting("genMultistateInput", [
                {
                    attribute: "presentValue",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);

            const cover1 = device.getEndpoint(2);
            await reporting.bind(cover1, coordinatorEndpoint, ["closuresWindowCovering"]);
            await cover1.configureReporting("closuresWindowCovering", [
                {
                    attribute: "moving",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS130F-GIR-DUAL",
        ],
        model: "TS130F_GIRIER_DUAL",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceAddCustomCluster("manuSpecificTuyaCoverSwitchConfig", {
                ID: 0xFC01,
                manufacturerCode: 0x125D,
                attributes: {
                    switchType: {ID: 0x0000, type: Zcl.DataType.ENUM8, write: true},
                    coverIndex: {ID: 0x0001, type: Zcl.DataType.UINT8, write: true},
                    reversal: {ID: 0x0002, type: Zcl.DataType.BOOLEAN, write: true},
                    localMode: {ID: 0x0003, type: Zcl.DataType.ENUM8, write: true},
                    bindedMode: {ID: 0x0004, type: Zcl.DataType.ENUM8, write: true},
                    longPressDuration: {ID: 0x0005, type: Zcl.DataType.UINT16, write: true},
                },
                commands: {},
                commandsResponse: {},
            }),
            deviceAddCustomCluster("closuresWindowCovering", {
                ID: 0x0102,
                attributes: {
                    moving: {ID: 0xff00, type: Zcl.DataType.ENUM8},
                    motorReversal: {ID: 0xff01, type: Zcl.DataType.BOOLEAN, write: true},
                },
            }),
            deviceEndpoints({ endpoints: {"cover_switch_left": 1, "cover_switch_right": 2, "cover_left": 3, "cover_right": 4, } }),
            romasku.networkIndicator("network_led", "cover_switch_left"),
            windowCovering({ 
                controls: ["lift"],
                coverInverted: true,
                configureReporting: false,
                endpointNames: ["cover_left"]
            }),
            romasku.coverMoving("cover_left_moving", "cover_left"),
            romasku.coverMotorReversal("cover_left_motor_reversal", "cover_left"),
            windowCovering({ 
                controls: ["lift"],
                coverInverted: true,
                configureReporting: false,
                endpointNames: ["cover_right"]
            }),
            romasku.coverMoving("cover_right_moving", "cover_right"),
            romasku.coverMotorReversal("cover_right_motor_reversal", "cover_right"),
            romasku.coverSwitchPressAction("cover_switch_left_press_action", "cover_switch_left"),
            romasku.coverSwitchType("cover_switch_left_type", "cover_switch_left"),
            romasku.coverSwitchInvert("cover_switch_left_invert", "cover_switch_left"),
            romasku.coverSwitchCoverIndex("cover_switch_left_cover_index", "cover_switch_left", 2),
            romasku.coverSwitchLocalMode("cover_switch_left_local_mode", "cover_switch_left"),
            romasku.coverSwitchBindedMode("cover_switch_left_binded_mode", "cover_switch_left"),
            romasku.coverSwitchLongPressDuration("cover_switch_left_long_press_duration", "cover_switch_left"),
            romasku.coverSwitchPressAction("cover_switch_right_press_action", "cover_switch_right"),
            romasku.coverSwitchType("cover_switch_right_type", "cover_switch_right"),
            romasku.coverSwitchInvert("cover_switch_right_invert", "cover_switch_right"),
            romasku.coverSwitchCoverIndex("cover_switch_right_cover_index", "cover_switch_right", 2),
            romasku.coverSwitchLocalMode("cover_switch_right_local_mode", "cover_switch_right"),
            romasku.coverSwitchBindedMode("cover_switch_right_binded_mode", "cover_switch_right"),
            romasku.coverSwitchLongPressDuration("cover_switch_right_long_press_duration", "cover_switch_right"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {


            const coverSwitch1 = device.getEndpoint(1);
            await reporting.bind(coverSwitch1, coordinatorEndpoint, ["genMultistateInput"]);
            await coverSwitch1.configureReporting("genMultistateInput", [
                {
                    attribute: "presentValue",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const coverSwitch2 = device.getEndpoint(2);
            await reporting.bind(coverSwitch2, coordinatorEndpoint, ["genMultistateInput"]);
            await coverSwitch2.configureReporting("genMultistateInput", [
                {
                    attribute: "presentValue",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);

            const cover1 = device.getEndpoint(3);
            await reporting.bind(cover1, coordinatorEndpoint, ["closuresWindowCovering"]);
            await cover1.configureReporting("closuresWindowCovering", [
                {
                    attribute: "moving",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const cover2 = device.getEndpoint(4);
            await reporting.bind(cover2, coordinatorEndpoint, ["closuresWindowCovering"]);
            await cover2.configureReporting("closuresWindowCovering", [
                {
                    attribute: "moving",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-GIR-1",
        ],
        model: "JR-ZDS01",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HOBM",
        ],
        model: "ZG-301Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HOB1",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HOB",
        ],
        model: "ZG-301Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-HOMMYN",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-IHS",
        ],
        model: "_TZ3000_pgq7ormg",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-IHS",
            "TS0003-3CH-cus",
        ],
        model: "_TZ3000_mhhxxjrs",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-IHS",
        ],
        model: "_TZ3000_knoj8lpk",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-IHA",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "iHSW02-MiniSmartSw",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-PWR",
        ],
        model: "TS0001_power",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-MSB",
        ],
        model: "ZM-104B-M",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-custom",
        ],
        model: "MS-104CZ",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-MS",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-MS",
        ],
        model: "ZM4LT2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-MS",
        ],
        model: "ZM4LT3",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MS",
        ],
        model: "ZM4LT4",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-nous",
        ],
        model: "B1Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "MS105-ZB-CUSTOM",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "ZBMINIL2-custom",
        ],
        model: "ZBMINIL2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-TLED",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-C",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-SB",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-C",
            "TS0002-SB",
        ],
        model: "TS0002_basic_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-SB",
        ],
        model: "SB04-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-SB",
        ],
        model: "SB03-Zigbee",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "WHD02-custom",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "WHD02-custom",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "WHD02-custom",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-CC",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-custom",
        ],
        model: "TS0011_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-CUS-2",
        ],
        model: "TS0011_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-custom",
            "TS0042-CUSTOM",
            "TS0012-custom-end-device",
        ],
        model: "TS0012_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "ZB08-custom",
            "ZB08-custom-ED",
        ],
        model: "ZB08",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-QS-custom",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-S05",
        ],
        model: "TS0011_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-QS",
        ],
        model: "TS0002_limited",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-Avv",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "NovatoZRM01",
        ],
        model: "QS-Zigbee-SEC01-U",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "NovatoZRM02",
        ],
        model: "QS-Zigbee-SEC02-U",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "NovatoZNR01",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-QS",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS130F-NOV",
        ],
        model: "TS130F",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceAddCustomCluster("manuSpecificTuyaCoverSwitchConfig", {
                ID: 0xFC01,
                manufacturerCode: 0x125D,
                attributes: {
                    switchType: {ID: 0x0000, type: Zcl.DataType.ENUM8, write: true},
                    coverIndex: {ID: 0x0001, type: Zcl.DataType.UINT8, write: true},
                    reversal: {ID: 0x0002, type: Zcl.DataType.BOOLEAN, write: true},
                    localMode: {ID: 0x0003, type: Zcl.DataType.ENUM8, write: true},
                    bindedMode: {ID: 0x0004, type: Zcl.DataType.ENUM8, write: true},
                    longPressDuration: {ID: 0x0005, type: Zcl.DataType.UINT16, write: true},
                },
                commands: {},
                commandsResponse: {},
            }),
            deviceAddCustomCluster("closuresWindowCovering", {
                ID: 0x0102,
                attributes: {
                    moving: {ID: 0xff00, type: Zcl.DataType.ENUM8},
                    motorReversal: {ID: 0xff01, type: Zcl.DataType.BOOLEAN, write: true},
                },
            }),
            deviceEndpoints({ endpoints: {"cover_switch": 1, "cover": 2, } }),
            romasku.networkIndicator("network_led", "cover_switch"),
            windowCovering({ 
                controls: ["lift"],
                coverInverted: true,
                configureReporting: false,
                endpointNames: ["cover"]
            }),
            romasku.coverMoving("cover_moving", "cover"),
            romasku.coverMotorReversal("cover_motor_reversal", "cover"),
            romasku.coverSwitchPressAction("cover_switch_press_action", "cover_switch"),
            romasku.coverSwitchType("cover_switch_type", "cover_switch"),
            romasku.coverSwitchInvert("cover_switch_invert", "cover_switch"),
            romasku.coverSwitchCoverIndex("cover_switch_cover_index", "cover_switch", 1),
            romasku.coverSwitchLocalMode("cover_switch_local_mode", "cover_switch"),
            romasku.coverSwitchBindedMode("cover_switch_binded_mode", "cover_switch"),
            romasku.coverSwitchLongPressDuration("cover_switch_long_press_duration", "cover_switch"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {


            const coverSwitch1 = device.getEndpoint(1);
            await reporting.bind(coverSwitch1, coordinatorEndpoint, ["genMultistateInput"]);
            await coverSwitch1.configureReporting("genMultistateInput", [
                {
                    attribute: "presentValue",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);

            const cover1 = device.getEndpoint(2);
            await reporting.bind(cover1, coordinatorEndpoint, ["closuresWindowCovering"]);
            await cover1.configureReporting("closuresWindowCovering", [
                {
                    attribute: "moving",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-C",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-custom",
        ],
        model: "TS0001_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-OXT-CUS",
        ],
        model: "TS0002_basic",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-custom",
        ],
        model: "TS0002_basic",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-TUYA",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-TS",
        ],
        model: "WHD02",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-ZTU",
        ],
        model: "TS0001_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-Avv",
        ],
        model: "TS0004_switch_module",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-NS1",
        ],
        model: "L13Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-ZB",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-BD-PM",
            "TS011F-BORUIDAPLS-PM",
        ],
        model: "TS011F_plug_1_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-BS-PM",
        ],
        model: "TS011F_plug_1_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-BS-PM-1",
        ],
        model: "TS011F_plug_1_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-BS-PM-2",
        ],
        model: "TS011F_plug_1_2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-BS",
        ],
        model: "_TZ3000_o1jzcxou",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-MOES",
        ],
        model: "ZK-EU",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-TPM",
        ],
        model: "TS011F_plug_1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-AB-PM",
        ],
        model: "TS011F_plug_1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-LK",
        ],
        model: "TS011F_plug_1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS011F-LIDL-PM",
        ],
        model: "HG08673",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0044-HOB",
        ],
        model: "ZG-101ZS",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HB",
        ],
        model: "ZG-101ZL",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0041-IH",
        ],
        model: "IH-K663",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0044-CUS",
        ],
        model: "_TZ3000_mh9px7cq",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.networkIndicator("network_led", "11"),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0046-IH",
        ],
        model: "TS0046",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS004F-LIDL",
        ],
        model: "HG08164",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0041-MA",
        ],
        model: "ZT-B-EU1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0042-MA",
        ],
        model: "ZT-B-EU2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0043-MA",
        ],
        model: "ZT-B-EU3",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0044-MA",
        ],
        model: "ZT-SR-EU4",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0044-MOES",
        ],
        model: "TS0044",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0041-TB",
        ],
        model: "SH-SC07",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0041-TB2",
        ],
        model: "TS0041",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0041-MOES",
        ],
        model: "TS0041",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0042-MOES",
        ],
        model: "TS0042",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0043-MOES",
        ],
        model: "TS0043",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0043-MB",
        ],
        model: "TS0043",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0044-TUYA",
        ],
        model: "TS0044",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TLSR82xx-2G",
        ],
        model: "TLSR82xx_2btn_remote",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS004F-Loginovo",
        ],
        model: "ZG-101ZL",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS004F-TUYA",
        ],
        model: "TS004F",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            romasku.batteryPercentage(),
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, } }),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            // Battery reporting
            const batteryEndpoint = device.getEndpoint(1);
            await reporting.bind(batteryEndpoint, coordinatorEndpoint, ["genPowerCfg"]);
            await batteryEndpoint.configureReporting("genPowerCfg", [
                {
                    attribute: {ID: 0x0021, type: 0x20}, // BatteryPercentageRemaining
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR,
                    reportableChange: 2, // 1% (2 in ZCL 0-200 format)
                },
            ]);
            await batteryEndpoint.read("genPowerCfg", [0x0021, 0x0020]);



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-AVT",
        ],
        model: "RoomsAI_37022454",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-AVT",
        ],
        model: "37022463-2",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-AVT",
            "Avatto-3-touch",
        ],
        model: "370224742",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-AVT",
        ],
        model: "TS0004",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-BSDB",
            "TS0001-BS-T",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-BSDB",
            "TS0002-BS-1",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-BSDB",
            "TS0003-BSEED",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "BSLR1",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "BSLR2",
            "Bseed-2-gang-2",
            "Bseed-2-gang-2-ED",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "BSLR3",
            "TS0013-2-BS",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-BSMN",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-BSMN",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-BSMN",
            "TS0003-BS",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-BSMN",
            "TS0004-BS",
        ],
        model: "TS0004",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-CUS-T",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-BS12",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-CUS-T",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-BS22",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-BS-T",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Bseed-2-gang",
            "Bseed-2-gang-ED",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Bseed-2-gang-3",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0013-BS",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-1-BS",
        ],
        model: "EC-GL86ZPCS11",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-2-BS",
        ],
        model: "EC-GL86ZPCS21",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-3-BS",
        ],
        model: "EC-GL86ZPCS31",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "BS4",
            "TS0726-4-BS",
        ],
        model: "EC-GL86ZPCS41",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint7.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint8.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-1-BSL",
        ],
        model: "EC-SL-FK86ZPCS11",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-2-BSL",
        ],
        model: "EC-SL-FK86ZPCS21",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0726-3-BS",
        ],
        model: "EC-SL-FK86ZPCS31",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HBS",
        ],
        model: "TS0601_switch_1_gang",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-HMT",
        ],
        model: "Homeetec_37022454",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-HMT",
        ],
        model: "37022463-1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-HMT",
        ],
        model: "37022474_1",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-IHS-T",
        ],
        model: "_TZ3000_qq9ahj6z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-IHS-T",
        ],
        model: "_TZ3000_zxrfobzw",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-IHS-T",
        ],
        model: "TW-03",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "LerLink-2-gang",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "LerLink-3-gang",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS130F-LT",
        ],
        model: "TS130F",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceAddCustomCluster("manuSpecificTuyaCoverSwitchConfig", {
                ID: 0xFC01,
                manufacturerCode: 0x125D,
                attributes: {
                    switchType: {ID: 0x0000, type: Zcl.DataType.ENUM8, write: true},
                    coverIndex: {ID: 0x0001, type: Zcl.DataType.UINT8, write: true},
                    reversal: {ID: 0x0002, type: Zcl.DataType.BOOLEAN, write: true},
                    localMode: {ID: 0x0003, type: Zcl.DataType.ENUM8, write: true},
                    bindedMode: {ID: 0x0004, type: Zcl.DataType.ENUM8, write: true},
                    longPressDuration: {ID: 0x0005, type: Zcl.DataType.UINT16, write: true},
                },
                commands: {},
                commandsResponse: {},
            }),
            deviceAddCustomCluster("closuresWindowCovering", {
                ID: 0x0102,
                attributes: {
                    moving: {ID: 0xff00, type: Zcl.DataType.ENUM8},
                    motorReversal: {ID: 0xff01, type: Zcl.DataType.BOOLEAN, write: true},
                },
            }),
            deviceEndpoints({ endpoints: {"cover_switch": 1, "cover": 2, } }),
            romasku.networkIndicator("network_led", "cover_switch"),
            windowCovering({ 
                controls: ["lift"],
                coverInverted: true,
                configureReporting: false,
                endpointNames: ["cover"]
            }),
            romasku.coverMoving("cover_moving", "cover"),
            romasku.coverMotorReversal("cover_motor_reversal", "cover"),
            romasku.coverSwitchPressAction("cover_switch_press_action", "cover_switch"),
            romasku.coverSwitchType("cover_switch_type", "cover_switch"),
            romasku.coverSwitchInvert("cover_switch_invert", "cover_switch"),
            romasku.coverSwitchCoverIndex("cover_switch_cover_index", "cover_switch", 1),
            romasku.coverSwitchLocalMode("cover_switch_local_mode", "cover_switch"),
            romasku.coverSwitchBindedMode("cover_switch_binded_mode", "cover_switch"),
            romasku.coverSwitchLongPressDuration("cover_switch_long_press_duration", "cover_switch"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {


            const coverSwitch1 = device.getEndpoint(1);
            await reporting.bind(coverSwitch1, coordinatorEndpoint, ["genMultistateInput"]);
            await coverSwitch1.configureReporting("genMultistateInput", [
                {
                    attribute: "presentValue",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);

            const cover1 = device.getEndpoint(2);
            await reporting.bind(cover1, coordinatorEndpoint, ["closuresWindowCovering"]);
            await cover1.configureReporting("closuresWindowCovering", [
                {
                    attribute: "moving",
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-MH",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-MH",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0013-MH",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-MHB",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-MHB",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0013-MHB",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-MIL",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-YBJ",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-YBJ",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-YBJ",
        ],
        model: "TS0003",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-MIL",
        ],
        model: "TS0004",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint7.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint8.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Moes-1-gang",
            "Moes-1-gang-ED",
        ],
        model: "ZS-EUB_1gang",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Moes-2-gang",
            "Moes-2-gang-ED",
        ],
        model: "ZS-EUB_2gang",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Moes-3-gang",
            "Moes-3-gang-ED",
        ],
        model: "TS0013",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "MS4",
        ],
        model: "TS0014",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint7.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint8.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "MS33",
        ],
        model: "SR-ZS",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint7.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint8.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "ZTS-3W-CUSTOM",
        ],
        model: "WS-US-ZB",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-PST",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-PST",
        ],
        model: "TS0002",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-PS",
            "T441",
        ],
        model: "T441",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0002-PS",
            "T442",
        ],
        model: "T442",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0003-PS",
        ],
        model: "ZM-L03E-Z",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "12": 4, "22": 5, "32": 6, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint5.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint6.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-TA",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"12": 1, } }),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [1]),
            romasku.generalIndicatorMode("indicator_mode", [1]),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.onOff(endpoint1, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint1.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-CUS",
        ],
        model: "TS0001",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0004-CUS",
        ],
        model: "TS0004",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "31": 3, "41": 4, "12": 5, "22": 6, "32": 7, "42": 8, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            romasku.networkIndicator("network_led", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22", "32", "42"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
            romasku.pressAction("31_press_action", "31"),
            romasku.switchAction("31_action_mode", "31"),
            romasku.decouple("31_decouple", "31"),
            romasku.pressAction("41_press_action", "41"),
            romasku.switchAction("41_action_mode", "41"),
            romasku.decouple("41_decouple", "41"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint3.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint4.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint6 = device.getEndpoint(6);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint7 = device.getEndpoint(7);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint8 = device.getEndpoint(8);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });



        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0001-LS",
        ],
        model: "X701A",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "Zemi-2-gang",
            "Zemi-2-gang-ED",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0011-ZS",
        ],
        model: "TS0011",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "12": 2, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint2.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
    {
        zigbeeModel: [
            "TS0012-ZS",
        ],
        model: "TS0012",
        vendor: "Tuya-custom",
        description: "Custom switch (https://github.com/romasku/tuya-zigbee-switch)",
        extend: [
            deviceEndpoints({ endpoints: {"11": 1, "21": 2, "12": 3, "22": 4, } }),
            romasku.childLockEnabled("child_lock_enabled", "11"),
            romasku.childLock("child_lock", "11"),
            onOff({ powerOnBehavior: false, endpointNames: ["12", "22"] }),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("11_press_action", "11"),
            romasku.switchAction("11_action_mode", "11"),
            romasku.decouple("11_decouple", "11"),
            romasku.pressAction("21_press_action", "21"),
            romasku.switchAction("21_action_mode", "21"),
            romasku.decouple("21_decouple", "21"),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint1.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint2 = device.getEndpoint(2);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genMultistateInput"]);
            // switch action:
            await endpoint2.configureReporting("genMultistateInput", [
                {
                    attribute: {ID: 0x0055 /* presentValue */, type: 0x21}, // uint16
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            const endpoint3 = device.getEndpoint(3);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });
            const endpoint4 = device.getEndpoint(4);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.MAX,
                change: 1,
            });

            await endpoint3.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);
            await endpoint4.configureReporting("genOnOff", [
                {
                    attribute: {ID: 0xff02, type: 0x10}, // Boolean
                    minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.MAX,
                    reportableChange: 1,
                },
            ]);


        },
        ota: ota.zigbeeOTA,
    },
];

module.exports = definitions;
