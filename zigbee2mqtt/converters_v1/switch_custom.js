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
const fz = require("zigbee-herdsman-converters/converters/fromZigbee");
const tz = require("zigbee-herdsman-converters/converters/toZigbee");
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
            description: "Master switch for child lock. When OFF, child lock has NO effect at all (ignored from physical buttons, Home Assistant and Z2M). When ON, it can be activated (5 quick presses on any button, or the Child lock control).",
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
    // Expose relays as on/off LIGHTS (native, e.light() = state only). z2m forces
    // supported_color_modes:["brightness"] on any light, so to remove the dimmer
    // slider in HA add a per-device override: light_lN: {supported_color_modes: [onoff]}.
    relayLights: (relayNames) => ({
        exposes: relayNames.map((n) => e.light().withEndpoint(n)),
        fromZigbee: [fz.on_off],
        toZigbee: [tz.on_off],
        isModernExtend: true,
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
                    } else if(part[0] == 'H') {
                        ; // child lock hides the relay indicator LED while active
                    } else if(part[0] == 'i') {
                        ; // TODO: write validation
                    } else {
                        throw new Error(`Invalid entry ${part}. Should start with one of B, BT, C, D, H, I, L, M, R, S, SLP, X, i`);
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
        icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAYAAAA8AXHiAAAdkElEQVR42u19TY8c13X2c05V98xQ1IikRNux4M8IgSMjQQJvnLyAQyQBsgicRWBmkSC7ANlkEUNeZEdyE1gBsssvMAwDMR0gQbzzQsw2b5j3hWEjUCLL1tiSbQ1FasiZnumquudkcT/q3qrqjyFnSmr5HqAx0z3dPTVzn37Oc8/XBbJly5YtW7Zs2bJly5YtW7Zs2bJly5YtW7Zs2bJly/aLaLSp1/3KK68U/s61a9cWPvHOnTsLf3bt2jUdevz27dsAgOvXr/d+fvPmzfh7XXmhFP7FmoGV7Xz+2USDjxljKFoLGniOycA6/+vVz33ucxf++q9f+uNLly499+67D57/yEc+JM8+++yD7e3tEwCkqjKZTOqmaVDXdXKbNw3qkxPsbO08ev6XPvxgbgwmk0lzcnKC+XyO2WyG+/fvYzabyac//en9ra2tpmkac3h4iMPDQ7zzzjs4PDzEycmJeeGFFx4YY3R3d9c0TaMHBwfY29sLt1dffdW89tprhwAku8L3sakqExFu3/6nf/7MZz7zxfm8wlNPXcCnPvUJMDNUFUQEtc8F3P2EKVStT1KFigIEiGpwVqoCIwJRgTEGUEBEoKpQVRhjICIQEd3a2nrkXJz4n4sImqaxrwXqnZ2ddwEVIpL2tQZNI+G5zHx88eLFByKinp1ERACYt95661uf//znv3bjxg2+devWxgC03JQLvXHjBhOR/P3f/8MLV69e/eLh0aGpq1oBweHhIYwxFlSqIGYYFZAC3AEWqfs02ccoBpt/HhEgRAC0YGKUZRn9jPyNiGjXY9L/ihjI7vsPEWn4HLeXQiDi3muiDxGKosD29vYXv/Wtb/3bl770pTc2CVwbA6zPfvazDg/VJ8tyok3dkKoWRAQRSReGLGJogJ45Yq4edYuGO47X0KDp6SP3fUtzoIUaykK5q9vV3Th+T+0Ci4jAzPzxj3/8ab9xuHXrVmas87CqMhNmIhESy1ALfLumgplBdhmpXbhluoCj5Y8XOnot2ft9kLTvRu5JMiQVB5VIDE5mhoigLMuN02gbByxmVrdgwwtOZJfUfQ2Lpf0FHAIXAJAAzIBZspNL8KsKIoUuDChw5/Vd5kqZqnu/qipkYJ2zbW2VIMKSRRwU/SDQ0gVMfuZwqEu2Nhq7QepGC2jw2UNemMJrpXd9/paBNYIVxVaPRQL7ULqGjsCWssFibbQ8/uR2AGBpwfh4O10LPC/kW5MhKZiBNUag0WMp2mdBg+xuicPKZx1UQl2mQoc/FoGOHFm1gOLAYKuAOgToIdDbiElmrJGssf/0WG07l+G/twBbH6CDrpHWoKDeS/hUH4z1npeBNYqZVckNGt7ldbFAa+LF8x+BegBMQxDn8/duKmMxPnC2nK3WYbIkzPAe/zUZWO8xmIaQo9F9WrBfOzsAnM/7iggePXoEIK2syK7wzHeFZRuj8jHtaDeoULCmcatlgPJCXaMYBkXAZNCa+kjPGLYUdruZsUYT76cXxMt+TrFQ8rfHdFtnzcQiisPDwwysEeR7CAYMhpcodYsEm4heR08lj9H6u7fV24EncbGiBwfHmoE1trqKUjNPwlrvQ1NmwnQ6PXzxxRfuO42lGVjnyFch5QIFVHrpmqXgUhfcXMJYj+MCVY29ojNzh56VSTYxCf2BCjeopgurA5AZg7XiPN+TLQ2DQJqB9V5FGmiJm+yIarWiq/fy+MYDu8E1IbWQ/9YBWpoJAFQJCujVq9MMrFF84WMs98JAkypINQWXnl6KL2PCBNiLSnU6oLKu0EBVcHCweZ/3D2DkvQsqjRTLmhzjS4sfG1SnV26uRN+9TsJ7qCoONhBZ5WbDpi0vCDtDEOL4KCGqgujEMAerSCNQkdolFugptJmeOgyhrlDQhReSaxORDKwxrDmlCKdTOrWhitQht7be7x/WVeljOghyf79pGuzt7WVgjXHBpBqCn6twoxF3KdpK0nU1UfcxjWq81sOsYP1aio5OYYYxJgPr/aevBhxSxELdeiwPHmYrPVUoqvvSxwpZ2PeUJa+hhbqNiNA0Db3++usb17G+keJdlRGrqMR9QVMQOZZRAgzZZDMtcZshn00EofR9Tr1tUJMI8f5tjU9+WR7PZrN5BtYYkn1JHs/HrhYxi0CTiEUSX2IHJhWoSG+XqB0WSm997eWvsyiK6N/Na/lQIlIiws7OzqPvfve7x6dlyuwKH0u+u3rwKObkO5lV1eofX0ZDrVuk7ldRsGMm22ZPmEy27fuIAKG13rbcx21kEiXCrXflAedrQWQx2o1TJZhdaG5gSNZYo7JWyxNhm76eLE5X1/edEgg///nbaJoak8kE0+kURVGgKBlFWYCZwcQgpg4g0kExltHaWQ6xqz5NGCLquNYMrHH2he02Pe3LscV/jGgwSLSMFNqg3eITVBQiwHRrC6/+z3/jh6//EFeuXEFd11AIiBjMBGICMwdRzcwoJxZ4zHa+w6ScoCxLlGVhAVkU2N7ewtbWFpqmSWY6rBu+cENC3i+V0h9sxorbvwJqogrSRfI8hAyCSLc1oqqKeV3h0cEjfOELX0BRFCoidFIdd3J89lWNMTBGIEIwxsAYg8Y0ODmeozFHEDHh8bqe48KFC3jxxRcXhjIWxbFUFdjQgW0bCKwiuBp/8/2Ey3xgHHYS1XbXwoAowdQNtna28Pbbb8t//r//X1+8+NTWL330I2Cm4NL8jC0iRjnZxtbWFra2t1GWJbbLHfA2gwmYTKaYTApMpgV2drZx9+5d3L9/H1evXsV8PrcMSMsr8OOxSMDykQAZWGch3RsT6ZZWyyTxH+8SIzQlTEaACX2IAmMUVdXgZF7hwbtv8nPPfWjryrOX8MILn0ZZFmFxm6ZGXTcQgWOsGo3UUGGYxqBqKntts0NABaIGly9fwcc+9rEwVytsMKhly6XhVdnMmW2bF3kvvUta7O4WDvLQgRADFCJ2oJppFEdHM0ynU+fGKgATiBgwA8yE7e0tMJdt37Mau+vjAiDbKt8yjYK5wGx2hPl8jrquB3aCupK5MrBG1Fg2SEodzZWCiuCn+rFjsOFUjYpAVGHUfhVVqADMhYvCG7fz9KwpUAW2tgBjDIoJQ7XC8bGAmEONvR2eRjBGYUxb/FcUBVS9MBR0Jnclf2dmrPdEwFPCQN7NxDstH4eKFy6tMrVu0o1/7OgZxzxKYGIABUQBJQFI8K//UeE/fwxcLBhf+PUav/GJHZgKAYi+hcu/X+wK/fuvo7UysMYyhZ0fuqR6oF0wXr5ASR2UAygAIusimRUQApihUBhx6Wxl3Ltf4WfvTrHLFY4eMlgKNGIAsqylIJtvDPEscgHVWBPyqgDpRi4RbyhdRQBaMdxjaYx0uPlLA5M4FiTAQG1dFhRKBZ4qC/zR7zyNC6Xi1z5e4nd/8wLqY4GSQonha1I1GY67jJG8W0wf31RXuJm5QjCI/K1YE0DLKVDELby7ibbTXlo2s7+9AOGoUVwoCVemig89AyvgS5vGVq/TYF1m664lVIp2a7LazEELdl/dsCyAml3hmYUbon+yts3wXaG77iddg4DXSMyvCAGoAGSgDeErf7IDGGB2YlAUbN2mL82JGLXt3AHiMhr/WOsiNQR/3WvqzFjjQKvf5hUxwKJwwzL+60ZVVSUaCtGtRnAuSwWsAhwDaASsCCEGn8fsxqNScHXcb39GqhIxdnd37zmtxZmxxtDvqoN9g2lIQtejLKAtCY3ZReImB/fkMM/dumAuFdACRlxVK1GoXxeP+uiaRWwIojuLMH5q+8HgPCpyLDPGLgAzw8hwvOd0zaL93WUA1kLgtk0cBNjdo1pCCXMiCFA1CTBaV8dtE0ivupQjBlbohsYbNnCMEbBohHXsBhczliQqQKOZk6QStIGNX/V7AoOelxZAFPVcxIUuJAAKHewr1BBxZ6exFmUSJANrLMbywKFOgPS0EYu4eICpLXFOpjD3dBstdbs9IA48/zQ6kLlsFv7iDKwzZKzWAfUWdr3FoqWxMctpmuQWfY9hAhZaJv41GgxHKx0xIx1UEuScYrCAMQPrPBgLaVNnt3guTu0s2gjboKWfp81QcUKdLKjY7eCYCAwbQSdtm2GtCJLg0lTdoU6hTrltyKBOA2o8MISIwAqwAhohi9wb2OKNnNIZ0Xx6hBxAUre0vmB3iWVX054EFHxpjmcP9w0p2QSytkBU18ARigdJB3Z8A5sDV+EqsABrPyjtLAk1GVijWRJwPPVMqoHzawaIQVTc/C20ZxyG1zHEy28u7XeiC2s9uyyVsBcA1rZpTXvhiewKx+ctleCSHgOeCcjiigi/I4S6RDJs93ULLoGwn2LTWHA4N6iw02vC2XadPkJVX7NFro9RE62VtJipwojJwBoVUCAwDzPZcne4+jgS7wZjLxtn8kAKQ5alSAk1BCURSmI0rlyicOELTXKN2u5mtT1UsQVT/1rFNBlYY8l3kXY6y5C26pwr2AEUI64k8Avvc3W2X1XCBsEX/iFKTxIIZGycqoGBsK3XUgWKIOIlYq9o4xmi84iqKKKSv2j3CQKaKgNrNFOxW6mu/ljOVtTTWCG67TuZxSsdA9Emgl0/WwgwiBTEwJQKMAAhAVMBFYFR2yFdUHroZRyQ7WoypX4lRtVkYI1jDVAUbKujosDooq9Drm7Zfb/4xkjrogaKPAmAMqEgK+TFhSNEJTowyrm6UFulKFzXD4HWKgFoMrBGvGJSkPIAO6VpmiTOpd10yiLw2arPNlRqEh1EUfRSoy2lRkJfk51nWh3h2VGhNkam/ig6/3QCxBYVCrWt/BlY501YTQMxvgGhq6UGOl5Eh7xOLxQQK+dQ9LcilKHR7FJ1UXL18S6mzqGc0hHx3YBHlxIVApPE1zKwzj2OxbZTRtrOmbaeXEILlqcYPyREk4MxU9cXdBbIdetIv2g5ikV59pIAPEGS6RG/S/WsxYg7feIKhmE5aKfNXLp06edrbWczsM5AvIdAY/dxv42PZzt0snnazvrU6HsRdcM+KHTthCjTwHiYmMmSzurBgGwKGk0OJx9OQfmQR1mWdWassYCVhBTaQ5XID2QLJ4VrUDXxUD5fk44ea7nTw4jBXAA+j2d8K397KkZ8PnA8Ez7ZeypQMIc6eFUFg1sKDZpQ0Etmk9VZm9qls5FlM55JfJUnDegqCjNHXYxojeH9IhrmYHkWYU1TPqLRqauuAiKdHUGJbiIliDEDA211KcOFTEBBkoE1WoDUNmKJRMnjuNhPAYKAw/5s9Zmr8fxRY4zbIMDGo+LBtp2KUAtacb2IKcDItYyBunVjNOAm+2O8c65wRBMRajubbbw67OqorRJo3Q0NinAohSS2dVVtIV9d16jmtW3hojbwoJ0TK1TVlrsQ0sPPw8aOw+Np2Yy9fIWESHwnaRS+lmXZZGCNccHldiWigBqKGYDI6qFQFkypm9NYTMUsERXztb1/NvnbHdymKwOrmgZQfYPG8tGCnfCDd7NW4Jsma6xztevXrysAfPQTz78jKlABG69dRG3HKFHCVG37ug7kZCJNFJWI2gRPFHOKJgbSElANhQxso4QLN2h0S4K3cdKo/76bGsfavL7CGhAjS9vWvfg+fXyMohiT10m0kJVWvc9g+GlBVWjvIXW7zayxxrHJxMegqP3Eu0pOckFIolZQa+QGrWtj1/5ueoHPACU32ogWnNpFRJBejXuburFazKV9tNNelnjGTqJIfU9ie7+u81CQ0cy7uF53TlSS0pLD4rmwRP0un6GSG8+ASQdP7326yp0iDdUHZ7s7ZKQjljh6zGYYMmON4QnrutOcimjn1Y6E1E7gUZWCthk8GInSRgxbyx4fE7w4MOADmr6OnqIjNe1ZiAImV3EVdF+3KJE7btG+h6mzeB9NYxkjYG6Dk36xJc4FMlxpsUdNNwXUOV5X+7u+dUvp4yFqhCWjtZmcG+c13tNuIOb1PANrPF+oMKJoTJPWP5GGoCXirmW/s6NWmCfNVi55zXYbdrprUQI5hdfXYzFDLQalH2XZF/mEal5xBtY52s2WsJxwtkV16XZceuXIPY3VYQsi/zyE8oc02r384HAGQ2goDIthsNCS+MTA66eT7YdZvI+BLNTRAUrqymSGp7V4gLSTY9qBskQx+BbyycKf2TPLfQI6ipepgsTeCkW6s1yRHxyy55678k5mrHGQFYbESnSIki6MDcU6ShNy8KU3FKa/6KDG6tdhuZMtRFFrbStawSB72lPsJUED+b51YmxEbhPSKGXGGsniBtDlte6a6p1VZb6EJBe0eP3jJgtCIYxCgFKRlNAEvbcgzJF+ABZcDufqhlGsqhDGLcZjrVuXqMnjfZM2TOFb5bUtCvRFfl0hTtQqf0XbE9geUceOrGzRn3EglbUYStutLNnKDBUFqWAyKXISegyzByipG5fdpnZiPeRd5XB/YbSYSsuHrLn1DrlkF9iymGIYEIRMGwcTGwZRat0sMx4/vURAmC6XXeG5c1bQP/Fczy7DqNqJxUqCRSolnfuQNrz6SS8coq8MUgIrgZXBSgFx5H6fJC31briHrm5Ji+IL6fF3q513ZqwzVlm22lMkcVVD6ZbFazk8EK2r4wAFSVsQ4dnH+AG3UBRSwrjmVX9QgGfQritcORhco6k1duxNBtYYVteAiAnjh6Bpm7rfiXlXR6uLR2P+Cs2koTrU/Yw9CbljflWtaDcQGDfnQdg2sTrRZStY3QEEGh1J1jvzJ+Qa465pgjBQI6d0xoKWA5ab7pJE3tt1IVASUliDBKP0UFqwZ/eT4oaw2WcQkaswZRjyDRuUTvsjrBHDwkLmFCgqsdr9zp2sscaIN4Ap3cElLrHn5vSUb6+9eEO8x/S7R2LYw5uYLVOhW6/gSqOjTPn6Qt7SnKmzKxyJr5xu6pw+2gpuDIrxdRPKsU5LIMAEcWxkXW57kCYAFKRR/L2dytctvznFvhAqQFX5tsI7GVjnjSwV63pk4RQ9WiWoVsgtDXGrFKvaluiEx1zyWpHoo6VhhIX3taf56nmubhgNWSa0y3TjVL7mSpBWZ64nskL4wZ1SH9d6IcYNAIhza0lg3LvD9jF20+G6Yr1fPq390ckkmNdVBtZYJmLCfIb08IA+c1HoLuxGhtpWnrDQaL/a3sW0qlQGzvDxZ48pUzovArS0k2eVW/R/22w2y2UzY+45VAAx2t16uUXjlF50aL/ipgJS/Jo24q0uJaPUh2rQ1qouzERtA4YL1VOHTZkZzHyqRg9VYDIpZxlYI1jltRXcmYCnCIAO7vycFfHCc7++nTrs1u5AixYF7oCmuEbMp53Ksgzvv+bOlFQFH/3o8/sZWCNYYYzGZcAa2oplAE52GBoW5Qqh9nT6gjCZlii5AMoJYGwqpiwLFEUBI4LGGHsoeZRGEhE0dWN/pgJjBMY0YbdqjMHly5dRFEUA17rjLZn9YzlAOmIcy7ustH9v7aPkkE5YLgpGWZa4cOECdnef0df+57X9e/fuXb179y5Np1MwMwrHOGVRBEHOzCgKO5mmcI9Pt6YouMB0OkVZltjd3cX3vvc9fPjDHwYzhwT56hCEfbxp8ulfI9m0zfwPLMW6q0ARkTETtqZTVNUcV69eoT/78z+92jQNHR4+GjxCJd40NE1jh4g4JmvqBrXWOD4+xvHxMWazGS5evIjLly/DGIOiKBYDSbu7TGAymRgAuHbtmmZgnbPKMsaAwe4kVF03VLUEZIzpVoGndy/i3//vv2N3d5cmk0lgGD+jqpvw9jdmy3hlWaIoCkwmE5RliStXrmAymWB7extN06yhr2hoZ5gZazSjfrMqreH2evs7bg8Hb5oGn/zkJ3Hp0iU0TYPpdAoRCYJbVYO78wBhZnfwpWVQG/vSXh2Yn3xM1A2I9UaN9K49D14bFVeEghlCnIQD0sweY3kE3Bbr+cUvigJN0+CZZ54JTBXfekD2ja2iwTU32jaBdXePi12fu94FRWNNnjYzpnbXhe1/p9FZQ6w2BCKvi4YK9oja4+aoE5ZY1+Uti2OZfOTJiMBStXVQsLMO2Fd4uhlZmrBVO5gIHHGaC2y688WD2+sDp7+Da7/6N+Nw7Fx6ob7WYQnUu6cTxH2PSjBVZqxRrO584GNi0MUnu4Xha0OlyE8s+IYAAn18+oz+nnl2hePYJNANhYOVlOw5NkRFpFVsasUuC0cjhTwehrp42lNX/c+XN2TQEpD2xis/BmAFVbWRGZ0NLfSj1sktjVNFExXW27Xzgt1an/0ep/PmdJrPXnNVHQMAbt++nRnrvJ2hr2mPZxRrpHGUfBFMe77Nco2DvhvrbDcX4ugcG5VVBQ8fHuXqhvFEljsHUDtVmtqdledPmtTFkooGBrNpJ1ShZ6nJ1t6gkKhgZ+fCYQbWSCaJD+8PXuwXFq+qG9eBgAWtGR7QJ1PoC309kRjBL//yJx5kYI1CWBOEqgWvs7zApqjaIa6HonUWssNiuqhkeBnrnQlXRYxJOD4+pgysMfU7tVP7qSfaT9du9cRAOD93iCrnCsfcFNozarRzZqF4popDCY/7eSfpDWlbTHb0xABLCgqpPVL4wmTSAO2c+wyscycJPVX91fldCy9gLl3LRQ4dJXzeoYwMrMXbQgxO4uuOkgpJXhmmrkWMNDiSalETrJ4tQMnmKt0JvqjrOgNrDCuKbU3yd6DeiVxn9okfaO06S22VZgIk1Y/ud1RVbv8aCVi2S5UQn/SwoNuYVuQFSTo5vmVaqe/q2nr7OEqR/k5/0sQil502bFjm8qduqNohKBlY45jY6X0TuwM80zE/srYWagHZaTHrFYjpSh1ox3FHzKsaHT+cXeFINg0gIHSaVLXLVrp6W0jraaXeRoGWuMQwlM05a1qSxNbFLfmqmjXWqOEGatvomRcJ7NNoIH2Ma1gHrEuAuVC7ZWC9R1Z16sq7AKGVC/YkgD6n2Elfv0FVVenhw4d5HPe4tGUVkSoNM0U7Ru99xbRE8aBSFYUYkDZK0oC0AakBqXn66ae4quZHr7322h4NlqdmxjqXD7kdYaTudPpxABSOCe7w4+DoDzfIgaiNlLbNPcxlWaAsSyqKEkXhT10V1HWD4+NjHBy8+/b+/tt/89WvfvUdVWWizZr3vplz3qNR2snxJb2A55Ozlh8y61v6nfv1RdCuGpoUFNyzA06JsiioKEqw61E1psF8Psfh4SMVMQfGyL4x5q35fP6zqqreNMbsAdh79OjRT7/+9a+/+o1vfOOBqtKmgWpzGQv9AR0eBNQ5BzDOwa07XU9V4kMllCiM7yOFclEWVJYTlKUDDtuGicY0ODk+wWx2aETkgYjs13Xz86qpfjI/Pn6jaZofGWN+eO/evZ/8+Mc/3n/ppZcOsGQ4wyYy1cYCqyj8UBB/SJLrrBHfMDE8Uz26r77DmMi6Km3HbBMRMfOEyrIk567AbE8aa+oaxyfHmM2OakDfqWtzT7V5czab/ZSIfjCfz390dHS0d3Bw8Nbdu3f3X3755YertJFqWyNz584dXLt2TW/fvo3r16/LpoJqI4FljCl85JGISFQhYoL2UYSudM802pIUETNzUVh9Y0FTuPYvmz45Pp6hqk6OVeR+I/V+VdVvNk21N5+fvDGfz380n8/39vf3f/aDH/xg/9atW4erxLqIJMDZ39/X73//+3rz5k11jLux4FntUzZBr1utoV/+8pef/5Vf+dW93d1dPjo6kiuXr+hv/5/fQtM0BGVmZpQTO0fBT4bxLfRVVeHw6BBi9MBIsw/Rtxoxb1XVfG8+m785b6o3ZrOTn8xmBz/72te+9uDb3/72bE3gMAAMAWfTdnO/cMACgBs3bvCtW7fk5Zf/7m+vXr360nw+n166dAm/93u/D2MMTo5PMK+quTHmHZHmnojsNY3Zq6pqr5bmjcODo/2Tk8O3Xt9/ff8rf/mVB1gxfMoBp/BsA6ALnF9I0HzggBVds/7VX/3Fp5599vlnm6Z57g/+4A/x8OH9Zmdn56f/9V8/PPyXf/nHe9/5zneO1mDBnr4BoDdv3kQGzi+gqa6OIbhdYKGqpaqWr7zySvnNb36zUFVWVdrQD1W2Mdzi9evXCwcW/5Vv3LjB6wAvW7Zs2bJly5YtW7Zs2bJly5YtW7Zs2bJly5YtW7Zs2bKdvf0vsK1j1rf1XI4AAAAASUVORK5CYII=",
        extend: [
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
        icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAYAAAA8AXHiAAAb1ElEQVR42u1dS48c13X+zr1VPT1D0kOKHFmKSImiREUOghi0IgtJHICbLLMJYHnhTZBN/oEDZMPhLlkEXgZRVnFgGBIFBAICJLCjeCIlgCPBimWTsq0HJdgkRXlEjsR5dVfVPSeLurfq1qMf0xy2VOQ9RIMz3dXV1XO/Oo/vngcQJEiQIEGCBAkSJEiQIEGCBAkSJEiQIEGCBAkSJEiQe1GoixctInptbY3W1tZu91Rcf2J1dVWm+sPRVH86CcAKMtsfsAVg7jljjN7r37t+s6ytrfH58+c5AOvOaioC0AfwBy+++OKJS5cuHWRmZYy5tbm5icFggKWlJRw+fBj9fh9aaxhjsLm5ie3tbaRpijRNkSQJhsNh9thjj722IJIMrPZK01SiKDKnT5/eTZJEAGBjY6N4XL58GT/+8Y+xsbExzeXuAkiCxuqA+QPAP/vZz/4SwN9fvXoVBw8exMrKCu677z4kSb6GWmtEUVTRHiICZoaIACzF78ycEMiIMFgEIiICiFYqExGwCEAAMyNJEmRZVgCTmWGMgTEGIgJjDLIsg4iIMYb6/f5HDz/88MXhcKiJKGNm6ff7O8ws7n3MjCzLMBgMisdwOAQzi1IKw+Fw58qVK//4rW996yciQkTUGdMadcjkMAB5+umnL3zjG8/+7ZkzX1kiIllaWqJer1cBk+QgAQAopfIval8nycFGRGDmnjNbIgIQgVC+np+Ait+VUsXzvgn0j3dAJqJlpdQT4/wxd4315+y1QWuNixcvfvPdd999BMCtLoGrM8A6d+6cPn/+fPbMM8/88Ve/+szBOO7JYLAbOfPmtJADEjMXC5TDxQINBIhA8gUXu5oVYIl7DgATGtpvnG+Vv05QikQpxQ4MJYjI8+kJRE2Q2mMliiJaWVnpPfjgg8tE9Om5c+dUVwKCzgDLyY0bN46lqVFxTJlSUUVbOI0iIgXAFJEFlj2mGq45NZNrJAbIrjsrgskVVgM8ozRQ/rzy3AxS7lCqANRppzww9cHqfhaLSGNM2kUfqzPAcsHSYDD41PogVC5Ou/NIFlx7uscFELI8BLVHez4AJps3Qh2Ho67Zf69vzrsoqisXevZsvtYPPvjga8w8zJ15kVGoEWsOsYfFYZWbPhlBQrnFrj/GBBwAZOT76u+tP99lYHXOFG5tbWUAOPefpGKWnONb+FZEhb/UxlhWjhfxzKRAWpz0SfyV86/GHdN8j3+88p435SJFEQWNdYfEMeJRFNmbWqZlvyeSm+IcdQu84kGznXOcHzbRDt8lZH3nNNb995/epdyv3g8KozQ/bWs8Dz0h1PS9KABr7nLz5roWaeqSuj8ynRmShupmf20lN4tUC+ualIOaXXvS6CCgyw686t4lb8XOHZrmj0737DZw0Fgz+0YTj+v2HRSANdcLjiKpmyLfWS4iPc9fUXsAqvLdqz1GhLcbTIyy2IPBoHPZDXf1jex4cLIYUR0zi442iaKocwY9wr0gToM5j7xbJl/SNO0csDqnsbKsR1qrieaIUXJTbKP6cbxUcZw9lqf8y+SRmwFgKqTmvthA+312d3cBTJ/dGoA1g8RxSj7/dJcrWogIP/nkk8NgCu+QrK6uEgDJsowA0H6DqpL1MBNR6eV17TF6HXdOIuIvf/nLnctE7ZzGUjYfxt86KVNTaGTyHFryqFqT9lAibBwH1haRjgPSJA1b3wbyCdJf/epXYa+wS+JnEZC3Tafw2eyq3A1ZDfdWVDhhIa3RqeV2fjbx493iN3YOWHEcU8ViieRZWdZsVJLxHEBEwEQgL02msYA2VVT56ccAWAAWAdnXi8hylMmFn6zXNA51ItVFkvXTdV173f0ay6qeNn+8LZdrUuKel61+z2ulexJYQp45Iy/im8YsjovmZk6nYdxL0lnnfdJd77RL8f+Eoog2bdWWJlyvqpl4DTNqJ/8zpiyQDcCaC/A8zYWWnyct5v5HeaMeE/Qcd1PT3V2msGbyCuedRluveq0gGwMoVYKieP/eQedK0PLPMOMvOgDrc4AfW5XccLy5jN5UTfswbIWxANoiRmwJvWPbdaTRX1wCswGBYJiRiSnL8z11KMReJFoChETDMuYQYYi4IlpVKfcvo9fJ37eLpvCe47FEBAyCsqX2brNaRzF+s/4xrly5gjiO0ev1sLCwgKinEcdx/nMUQSkFrTVIKShFUKTy0lRXgi/K0zaZ6xHRYnJpLKjczZJlWdBYn1fnvkIrkEcbCGCEQVpjMBzgpz/9KU6cOIEoioomHb5mqjQXoRikKC/ZJ0IURdBaQyuUP2vCoUOHsLy8DGNMY+tnEr3hTGHQWPO4YJtBKqPLiRv2xeeoCNYcVcwq4cbNmzh56hSOHz+Ojz/+GF9YXoZhhlJlcxFV8b0iwJpfkVwrpWkK4QwiYjvSCH75y1/g2LEVnD59uugxUaT2jPGf3Hc0xuDy5csBWHdabHbDzMIiIIhnCl3FtMJwkOInb7yJq9eu4uTJk7j//hUk2QDCXGiwNE1BRNBRD73eAqI4htYKWmmICCKtEMcxlpeXsbi4gOPHj+PixYtI07RGW9BUGtcYEzTWfIAV3yYnIAUTL8xgCAwLMpNh45ObGOwO8Oijj+KBB76I48ePI80G0FpXzKAIw3D+/jQdAlBI0gTMABsGc4bhcIjd3W0cO3YMDzzwANI0RRzHe+bjsiwLwJqP7LbWEPr0gCICcc2/ktJSio0ERfIoUVjyCNAYDJIEwzTF7nCAYTZAlg5BaVkKT6SgNYFEI9bAwYUU2eB+ZAs7MFojgq5QC0SEXq9XaLq2XlqjNJZSCmmaBlM4T7phpCmp97BqqXIuQUh+dz8Yw4Xv43wvgoBIgUhBBFBKIzMZqCfYyPr49JNDOHo4QY8TIDFIacG6efm54zguuve5z/X7eI37jsEUfgbA8jM2/cwGQjWDQDC6cx5ANRMnjTgg11Q5yACCMYy4p3H52i08//3r2DAKX1wifONPjuDhw0sYpilIowgSfPbdDyKc4z7J1zLGdHGJurmlk2sYk+ucSiZps+PepG4x9ff5TduEuUhnYbbaxgg4Iyz1F3Ho/kMYxgs4dpzQXyKkRgBSgCgLSAVmwBhpRIDT7HUSUQVYd6huMQCr/gduy2HaW4+p+vFV7WI/DS6nVFiglAYbwUMrB/B7v3MIycfr+NrvnsB9/UMY4BZEZWhrZbT3a6tqrC6BqqOmcNG2hFRTE6Sjj2kmCubPc7Hd429Aildpke1keOiQxte+tIAHegxKAIqWwVnmFcYSCAoQapjstvyvtnz8wLzPC1aLKHaGFenCT/L34FwF8fSaTwDOG9+KMSARaEVQ0CDKSsVVshXIxOCRZcITf/oYhju7yEQQc5Q3bKO8Qw0zQ5A/mKm2R+hO6F9nvaVRbkoDsOYk4qWEikyvoaY+f5vJotrCgyGZYLDFACnL6ovNcG5mzI+mFXzKpPr8tDdIANa+Lbxt5+j1+Nzf80vDdNU5Cz8lplh88dNraOR5635iHVR7NenBed8PenR315o7BTiuyfNZplmM+nHlYqvqRnM9Gc8/L+fmU0xpRpXNmnA+Fol/LXmkKEIg0sXv48CdT64wKr/k4Lx/BhpMZmojlGc5CMo4QGpR3Lj3lg3cfc4Mwg19JRPv7bbrNo6k3QbQOTIr6jiibt9UCPLIDX7ENgXlAYJ2/p3tC09cglVqDn/RlaToTkKlWmvXqqy11qceffR/AWwaY5Qd+xJM4Z2iG3LinRuLMi3IHHmZp4+qIhlebAwnAEgUlOj8dT9oIwbDgAHERkExIJJhqAQkEUQUBApC1vRxDiJ3Zik+JX+QLeUnyc1r/Xdzm9kcQWNN72U1CkP37Pg3Ckul5LMAMOcTvbSyY1Aa2gpQMNiKBQkJIggWsgwAg4mKog3xtKJLYc45sjwJn1AGBeKRs5X8elISgDVXn2q29/rRWN15V0oVRAEXQy+kUUhBApARUMRYYALQQ2QyZDoBUy01hhgghoiqOOU631CE1ADukOsNkOpkk+5OZpAW97gwmGVPznt+bDPDlKV0X9yoFLHgEi5ycOznEhQiLIKhIo1kqDFUGkxSlPH7OqvOtlfwIqMpBhEBOjpRoON1hdUWRrel+bhodJYPy3T/yO/254pfCRwT3ox/jRf1/2FrYQtGERi64qe1ZTfs5dqmiSkDsO4ouGYZMVIunL/gbLNK3d6ggcCQewBGAUICxBn+6dor+Ov3LuCaXMcCUjCJBWHpoLOYymdM3Uq8zIsPPta8pLrNISOApcYASiwgBSDOM10gefYCCJwZGGYYiN1E9t5KALFAjOCPjv0+TgwexVF9GFGSguMImiKQmNyvgt3uQbU0n2xqDUAQJdV2ENb8OqJVMXEA1hzEFVOMG9G2994KTa1Vacrmn08AUQqUZviz3hNI+owtMdiOgCMDhUGPkYFsLpdUdeMMEYcg7BXO1Xn3szB9oPjjc8eZmXGzaioDKcnvGWljRlJg0kgHDCYDigiZjrAdW43Tktc1y2wcASBKmQCsOchggJIaIH/fjWvz/sZPQG0m86GRNlzyXbUoD4JEKexEhJg1lhKCQDDUBkoYBKngmhpURzU6VC1db5hyX22h3x8GumGOPJZfinX7nBi3mshKBXWF7GSQESwaQcT5TBUSg0UjSCMFqc2BlobGsg9LlLbREB6nFZz3eTrvLmWXmfJ9X3//DYS2fdu2vqKCtlQWz/dyIKBy20dYELOCUcBQE5SlJAwBmr15PKTy3g4NbWmJUUdv2GoiD4VlXBnyseYjWqdC0CDYfTySwg/KjZaqNqm1C+W7SQyGsHgaSGAkA5Tlq5hhxORLKwxFCsLO1NoIlBTIZoqSjeDyn7mI/AQCqLz3qcDvkCMQGHsxyvJlHqFW3kLo6BD7rpZ/lblTDR1UdPDLy+ghdaJh5HzyQlNlWQZjcspBWJBx1uzDDgYxWdYKjQgQwjm5ylz4f+27A/5mJFevpd4+KQDrzvtYhZPt+cmuV7sg11B+mO9rLMHoaFBEkKYpkiTBcDjEcLhbONf+VpAW3SBbRQAmH8KCKIqQJCn6/aiyP9nw7AtQlT4W22sJwJqDpGlaDBuvaCwufRaFsnV2W8tIX2OVfhUXPa6iKEKv10O/v4BI2WJVAcQjXXXlhGXFNZOv0xhRFGFz85b1lcoi2WqEiMbFudcDsOars7yyrRIohbLwcuim70FathZyEacbKuCpvvJc7FMEZSaE+MZSuLK5PSIU8dSWr7WmS7MOwNrnqNA9qGYK65MllKDIkSJMV4HszFhBO9SsFdVA5rRQk22iyR1129QomnWFa2trnVqjzmxCu1l9CwsLzMzimxYSgbYrqpSAwFBEedeZlunzbXwVicrrI0jyLn9MIFv8IFB5AxGLEyZ4WQ/58S4n1AeVggLZFJv6ZzZZebccCnmXVAqtIucqu34tYWl+nGYROwO6KBGbJkeLq9qm1FR+kURNa9KI4LLWBLcA9J558/wahsNhJ4GlOoir5v6bt9AklOdLFRNWx49yc0l+YtsVVQhSt+84Y9GG7EPNY5IkQWPN33mXctyuSJ51YHNUXOmC7cQ2XSMOt4nd4us0/LwR56EJvqHrDth2b1dPmTt0XW1j1Fkeq1JjTyioBmNNIftbNdOU4fs81ygN5bIm5rgdHOiGuUaF0uzZYOsBSaz5o3IC4XSdZ2zxKqjKYTSwJ17nmWlugEkHje5MCASCdL5eFuVtqo3JypDeLpDhHBSklPWNaoUT4GZfBitaCGTYkp/k1Zm2VdJIq8ITqFJDwvZDtX5ga/siaR8mQJLvI5okmMI5mkIueqvn6b9SZlqSA4sp9gwrE58nKRFBgwaYhv/y52M6epMKv2n26YYmZDfM18dq64xXGbbE0twYxgxVMt54upHtJ3lE4xAXGc7glhWNcIPzPm8fyyXoWZpSjNc/tPx9EsNS2bOzqS1+DpTzu9qmsRrL/OfmzlNXlv4oTV4VnM1ZiS1XaTNkg481d1PoV+tIzXeZpX4vt13TJta5jIlYRRbgns9EAl3JzpltdLm0tBLvinSOIN3ZQaWyxo8Q3WJMW4rXxm2NA6ZPlrIIODLYlC2QmHwjhvO+NSMHmu+drhvJlwVg7bNoHQkzgyUDS1bkqzf34DjPOmiUT/k93W03GFEF3ZDvA+aUgxJBZBRi1oiMgjYKmhU0a8Ra45+T/8Y3P/kHvKOuIFUKCRMMCVgRROe57znhOj04clCWis5kaQDWPOTAARstGVNMkrhdreD73X7mQqWbspTPR0I4kCqw6kHHR5CoHrQoZD0B241KadkznB5fJfsfmPd5XXAUSZaVoNpr6fo4TVEZ11ske9nPIRsYiCAjgw1N+Ivoafy5+gp66RKIBUvaIIGGySdA2YmuZbHEnvYOLZhZAt0wF1lZWRkAkrle7G1TKfbmHDfTWPyC1mqrofx3xYI4A7JUQ3EPqdZQlCEjA7DyOC0vYW9kK4DqiEV3DVrlk1sltOOejywuLpYFd8IjG/NPbXekqbWKOsMxWlCBAR0h0QoKBoYYhmLEtTk/8KvS9gT6/P1ZoBvmK0SokKB1XmqW0L7QGgzbtLbdMWLFMAREAkALyKRIFEAcgywh6uNWZsJWXr+YBR9rfpI77makKcyfVwUAR5vIMgHPtfjOM0TF1h8CmfLmCxbwyPcDmUzesA8KPQYAU0t+EEAy0JjGHqTa6Q0GYMDIOABrrlLvErOvRQcj+sVXaIMpijTqQy/rGnWcdnUvMXNobjsvcSX2jhyd1DFmb9xDrW/7iHNOY3J9TVofYzc54CgGYXbSyVJd1VZ+c422FJh8KqouutGUD1SPqe0DupQEl81VB4L/+W1Aa7L4Vc3lD2oa5x8yM4kIzpw58zIAnD17VgKw7qBsbNTaZ8vtaSmXJ0V+K6PcBS+JUTTn4PhA8cf/ttEWrhDW/T99P3pBv9/rZDVF50eeVJrtideS0W/8L2j1jZzBy6ufdTH6d6EXI4oiRFGE1CRFnnodJD6YnSYqzXT+vzs2jmNorSfOgq5LmqbBx5qTzoLIStltRhTIPchvyE9jlHRZ7qU0oLRC1NM4cGARC59EuLa+jq3fehCb27cwsJ3eXKMQp5VcVOoAVO8w2Ov1oJTCww8/jGvXruGhhx4qNJjWekxAYq9SuSYiUehBOj/v3UuRkVm0XGnGnAaJoghHjx7F4uIiBsNdZFmGt956q+jj4DRYHMdQShUayGkhIoLWugGe69evY2dnB/1+H0mS7Ilny7VkFhqvzdEAls76jIbC95OUUuj3+7hy5QqeeuopPP7440iSBIPBAFmWgZmRpmmFP3Ndadzrvm/ltE2SJFBK4fTp08iyrGJCpzeF+UkvXLgQgHWnJbNUA7OUVczAyPB93PPOLzp69Chu3ryJV155BUtLS1hcXKwc67QRESGKoqIrzcLCAqIoKrSX1hpxHBd+lVIKaZrONPYOAOI4tOOeXyiraF+muvsRGjPjySefxKlTpwpn3Y/43PFtGm+UGXNpxbNoKheMhN4N8wRWLRluFv/KB4ADzHA4RBRFFUfave6c9DrpWT+fb14nacxpyBCtdfCx5iUm7yKa1/spAikFJYAWO1GXUNmfyzM50ej/3iRVqaGRfKBMs+FN0A2KQ2SWO8AWbBgT6IZ5SYX5nrIi2fFP44olnAkcZbbagFenCTpb/RCA1eR89kIv7Nc5u9ppLwBrSrAUGQe+NgG1D5jcR9Dc8anyRb598LHuTpl+HP0d+NzuasUArInrS+0gm4u5Bw4dOjgIwJrbH7wsrXfVLwYMJtW406c3g37EuJemtHUkjvDjRM3wPQUHDvQ7SWR1NB+rHRZ3o2xvB7phntCajwO9rzZVxn6XZnDgeLNOWsJuJvqR7d5XZ7/HTV39fNwMbY+q6Rs52TUA645Dy44nuTu4JJcFW84fqA7lDHuFn4WP9bnTSpPN98Tnixsmv+c7iqsOb0JjekZ9dPTnRWuVaE7G+ESzExel/zS6OW6eXq28iDZorLtepmpH1DJZrC2SdVM16gRsvXNg0Fj3BrL25c1+K/H6nB3Y7aj6kKYArHlF796dPWsi3bSfM6sfN7HT8ohcLv9zXTFHANacQDUq0W5eYB5dwHw7KTS2S44UVdDY3v40AGs+cuRzAu7JTnolRphQSt8AFwBjMtnZ2QnZDfNbVFXpZeX+J9LlHt/IGoT6CIhZc7S4/dyiZ6QbvPaUYGEWBkTfuHGjF4A1D311BAWY5u67+70aXAoyeQyGjLsZGsMOhIiKGiNSJARCpBWJkF5e/kL8/vuXk3feeedtIsLXv/51DsCa4wKPXM36MPDK8TS9VqEJJsxFeGz5qXzQHTs6QZFiL8ggANqWjlEURTo3qQRjDLIsw61bt5AkycalSxdvvvzyy3/z0ksvfXDu3DlFRAFY8wKXiEzwVabxadBwyKtOOjeQZ02vuMXOo1KQIoKOI0RRpAG4KmmVNwzJsLW1he3tbezu7mJjYyM5dOjQa4PBIH377be3T548+S/r6+vm1Vdf3en3+y9/+9vf3gYwPHfunDp//nznags7zWOR7fdZkI3whwlQC8MtY6M828FGlCr79itN4goxAETu5zjukdaRggjSLEUyTJCkCW7dvAVjsiuDwe7O9esf0cGDB/6z11u49utfv6/eeee9d06ePPnaxYsX6bvf/W7y0UcffTDuuz3//PP62Wef7WRLv64WrErZyExh1EzCeosjD0hsf2fKnR9SirRSMWmtKYpjrYqceoMsS5EkCTY2NgDgk83NTVpf/2jj2LFja9evX6f33//g5unTj//bzZs30x/+8If0ne9853UAW1NoXeVU6Nramvsfq6urhojQVVB1EliDwYAAIeZMSEFMxgQhCJPkjWSKqmVT7VGqSCkFpSIdRZGKoghEpFxfhk8+vYmdnR2sr6/LwYMHXk+SZPvatQ/N4mLv+1rrjy5dukSXL1/+xalTp37xve99j958880BxiRLuc81xmgAtLa2hvX1dbl06ZJ4x7SauPPnz6Pr0hlgWW1Dr7/+unnkkUd4ZWWFdnd3qbcQZ72FmEB5nE8E6ChCL+5FjpJI0xSDwQBb29tYX/8YcRy/ffXqVXNg6eB/JGly45e/fNukafr93/zm6icvvfTv/N57b707WWsqGGOitbU1AMD6+nrRvOPChQssuYCIDO5B6ZLGkhdeeEE/++yzm2fOnPm7OI7/ajgc6g8//HDpyJEj2NnZ3gEo2dnZofX1dXPw4MH/StPs0w8/vErvv//Bx1/60m//6xtvvEE/+MHapz/60atvTDBRBJu34puot956S1544QX2NFKGIHsMkT7n8tRTTx07ceLEsoj84eHDh9Pjx4//z7FjxzZ//vOfy3PPPScAbk1hpqLnnnuOnnjiCTl79iyvrq46U8QBGvcgsHJucXzClIjotTUQUDVVly5dkgCcAKyx4FpdXaW1NaizZ/NIb3V1VTx/LNTABwkSJEiQIEGCBAkSJEiQIEGCBAkSJEiQIEGCBAkSJMic5f8BFcr7G7cKZa0AAAAASUVORK5CYII=",
        extend: [
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
        icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAYAAAA8AXHiAAAbX0lEQVR42u1dS4wcx3n+/qqentnlcpd6kDSjKJQFk3ohUCDpYAE2Ih2TAMkhsQ7JLUFswPfA8MlkDjkYSI5BoosDGAgQ7cEGdDACUPEasGQnlmSIjgJFhJeRGFEiGXHJfc2ju/4/h+rqru7pnpkld4dssv7FYGd6enprp77+3w8gUKBAgQIFChQoUKBAgQIFChQoUKBAgQIFChQoUKBA9yNRGxctInptbY3W1tbw0ksvYW1t7VYvxf6LM2fOyJ6+PJr69UkAVqBb+wJrwOWOGWNU5Tue+n1Xb5K1tTU+e/YsB2AdLKciAD0AL37ve9979PLlyxLH8WEi2j1//jwzMw4fPoxer4der4c4jjEajTAYDDAYDJAkCQaDAYwxYOb05MmT/xHH8QgAkiQxzJyeOnWqDwAbGxvY2NiA/3xjYwPr6+tYX1+fabkANgPHaoH4A8A3b978y48++ugfP/nkEywsLGBlZQUnT57E9vY2mBlxHEMpBaUUiAgiUnqQAMwMFgaAkSJlhAUGLCIiRJT656dpChEBM8MYgyRJkCQJmBlpmjqQ5u+JiCRJQsycfvGLX/x3rfWQM+r1en1mFmNM/jkRwXA4RL/fx2AwwHA4BDOLUgr9fn/30qVLr377299+zy6NWiNaoxbdBExE8pWvfOXc1772te3nnnuuSwQsLi6SUgpLS0tQSvlAtEAiKokrBcqPGWPiXHQpe467hv+56nP/77j3RKQkBrPzfn/CjVK6BjPnn3Vr11rj/Pnzf/ruu+8+BmCzTeBqDbDOnDmjAaRPP/30V59//oWlbjdOt7e3I3f3p2kCIjXGjqWiBxGLZdNE+e4KACbHvrNPZWDxgVKnR/nn1ACGiUialPw6QPrYi6KIjh071j19+vQRIrr5ne98R7XFIGgTxwIADAYDNRqNoHUEIg0RBSIFpTQAApFAhCFCsD8ACaDqADKGFmsmshSALIGyQVEvcURVAreeIt5RMCCpvidEmpJkOKparwFY+0jOWtrY2NhJUyNKKbLixoomZsBjFnazxf2e8Sa3jApKKcgetE9fjNVzIZmgztIE4GGMC7eFWrPql156iQHgxIkTPxeRAQCdKdv5JtyCn6l2j6sKv3vM4nLwzys+i4ngaXoABBEgiiIJHOvgRaFhNuxvnrOunNpkN1dqxdlUBwFlQLlFe1mk/u+NcdPSH3XncAVwFpT9fj9wrANU3gWwd6/s0/1L+YNqtJwDdJ14P/4qRPwHPPG+gMCxDpjiOE73zeT2Ocd+oUpountQ/NNlqkhtI7UOWP2+Up6nYMxnVWwQWZdBtpHubK1obH9FJMcCu+uKxQiRzs70rTep8DzvOcm+uJ2dCCciRFESdKyDpuFwoABrEbb9rp5mBLT5f2ydLbu4iHtGXIwr+GULNONYAiyyr2cGYB3UolVZ5Lm44CyAmwbGPbsoDp6LpadOPdM6s1Ah0F1Phw4tSQBWoEBoVxCaAEin06HbEVtN8b4mESlUDdNlni+pftY99u9eLfStjQCsgyZjDGFPkbzb39wcT96TkHp7jwErTdM9x1v2RSGX6pMArXtKx4rjuOLaln0FWFUkNsUaJwWnpwWuq0l+zSIQwY8VaJqeNA7wu821cV+LwraBqg5AxWvCvVohFrWXC0wRXwLA5bxDpmpEbrOViy9W9p2qV2i8IHvX9MS1RN56XfpzJQ5e+j8YIgYA59VCAVh3GxBvR9W+rQ/7l+EajlXcILPoYwFYdwOYqMx0mG5NoRQvNWK/dKKy8t5sAIQg9B3iQ1Udpm4TGJKLH55iJU6y8vaqrI9/hmsfTdd2oDLGBFF4V3IsseBSyLIxG7hOns9V4RJ1tYWTwLZ3rhaU97tOgZ+0ieIl7BFRBi6aqrwLM0CFqs5V7jNF55rmo5odWBSANdcFRxGVuQfnmzPJjHfvGA+QDkQqAxIbY0GVncPGluITKUBcjrqrnFb5lW0RhKuINgCkWl+4Z23EL6wIwLqLyNUVThI1IgJFBMMMRYROt4skSUBK2fe0hkYEpVWRKgwCC8OUrDkLDmYLcqoRp7eqiAer8G4BU4lF1cstJ0a11hYMGYjOn/8Vdnd30O12LbCUAhTlVdQgglYaUSdCFMWI4xjdbhedTgda26LnTkdDa52DSSmF4XCYvz9NhO8HGAOwboEGg0HFEqzvn1ANFUuFe7nPMDM6cYzrGzewtbODL3/5y3kHmCQZAbAdZ/r9PoaDAUZZt5l+fwhmRhTZr9AYk1mDnIvCNE0RxzGefPLJvFqaKj0hmjiUq5Vk5lnbJgVg3R71ShUst+NasqLLom40GuHEiRO4cOEC1tfXcfz4ccRxjOFoAKUI3W4Xvd4ClhcXEUURFNmeakpZk8CJTyILqiiKoLXGBx98gI8++ginT5/OC0+n6V++uyJfYwDWAcOqVy2Bvz3R6XpgpYnB5/+3gc2tTfR6i1hePoITJ76Anf5WqdpaRDBKRkhTAWdcigVgNiARiJgcWAsLCzh16hQ+/vjjvKfWNEu2+mAOIZ15WYXivvBM7clL60tZA7lfyhn1Tjw6C05BhJEaa/WxCHZ2d9EfDHH8+HF0u10sHlpAp6dczxpPuFolPlIMVsBQNMgIOpxCAJhsbU48PvjggxiNRhMduXXH21yF1ErlfdxZOfmcsQ2DQJhzLmTYIDUpWOzr0WgEY1KkJoVJ0wyEDrBZsBopRpKCxYBFQdCBZG4Jh0GViUfXvc8p8LP64pRSwfN+x63AvZjpnsJPBIgxMIZLISLJEOssO+as2hoEFsJQFqzyrhJElCBVjKEixKm1IlkMIAU4/GrtvSTxBWDNmTjjOE4cumO+1dUc96NKf1KLNgeeJkXaWX0ijMOLQ6RYApkFLJoUaX+EESKYOLE9tjzRKUJgFjiGVQVZXb7WnrrkBGDtI7dSamaLsEl3GU8BLnMSt/EWwEWqC6kYP7uQ4M3/+hQQ4HdPr+C5x5dgZJhnQ0jmqSexnnkrdjl3pk5zO/hrDRxrLn6srHEsVRXqZjCVgSUZF6mASupL3K2fLAvrwIrOhAn/9tan+HCrByUMc2MdT558FrFKIKxAStvPMQBFYHYctsy1ZhHlbXU3tDJtRpggrACxPUjZNVrLQCBiZurEJ6LArppMCCQ2TmgbUzGEAQUNhQgkCgQFkxA6yuAv/uQ0Hlkm/MZKim/+0XPo6gSgCDoDlQt+2x+VrY3yxmyFYeHWW30U628jx7o3iikE2A/LPN9sjIOSQBC2XCZNEhxfNniQhojjBEsPJUD6ORRrayFOrNBpOkaVNpEIDtI7iil/OMBtKLuu1WR1922gWtn8dACkCICGuTnAN3/vS7gZayTbfRAWAR4CpCGg+jBTrseVXSVO5JZFevC8z5V6QO7qLGcQFJsxA4ryggYZK5W3Fyu14VaU62EEgqIIRIKjSzt4kGKMdgXb3RgdUdBgq7R7TlrysGrjkwKlClA15V65NQXlfX5syuMALl5It835iuecO0upwhWFGFo0km4f/7T7S/RGC/iDhSdAmoB0BSQpSKW5S8O3LQrO6oDdrI0IJHje74BnNA/l7Aeoiq3MuASLfUg2oYKtCLOZqIBKBbuRxt9vvIFe0sVXDz+BZdZIeAuECMRUyDkRKCn72soxaGnUG2d1ogZg7Ye7AQM7zYEEIEaRKjVr7pKC+P1EyWSWmV97SCBoKIoghjNnZzZ/B4KEUiyIwt8c+TOMIAA00kTAYJDi3HWRrwvl6Qa2r2mh15HXdyTvdcsEzQpKdADWvLSssjNzv5hgPmOwAAWo3OFYBLAdUBGNUvxO77eQEqE3SKGNQqqzSiACPMRDKuusGx7VxLGCKJwjzypbWftDzrueTQWzgWMpkvO8FsswAihRoETQE0JsIhgiQAlYTJ5xWtLNIGMWbOjdcBeR1lqUolI1sX0umZXlm++TdSrm4iSWIl89j0FmNfDlQU1WXBnoPJkmjQipIrASaJbcNeGAyhgfnVJykUg9p/I5cwDWfIxCz8Vw636vglvZpu6OWw2HQzucctCHGY4sB8r22Chbp8jEWVo9gcmbMqbEcytwlhlRTvBzx6eGdG4zkTEA65ZdA/tZ8l5wkCiKEEUR4k4HKUsOLDuckrKCs9QWwxLBECESoGMIiWIwGGCbMuMKK5pjl806H4vjpAFYc8OWv0H25lZ5m+7y9AjPnSDFpAk/pkgEkBKQspameyhN0FGRAMNZ8FsDAPXyiRfs/F0a6CgD5mrRBJcAVe2PJVkGrALlFdwGAmlxwK2lPUgzKVSTDlMfHnGvm8fE+ced4s7MeVGrX3ovnjx2uVxSkdMu3Wb2wtVJRsW+MugArCbl3e1tU5vF2cRo/fFcqQYVoRzl5c7nf5KzXhC+HmRTnm83btm0Xgoc68B1LPILKnxu1aTo1w11qj53CnWp/IoAyiqm0ZBWXM33qn+vvjLa5cU3gb4chKYArIMkv8VPY/TfKSg5slwXPWlU2/ySq2qAmzOFigulLnNHIB/6BdCYZkel6M64KG5af/6+Ccr7PPWsMQ51u6KnmgOVg4sIMmbVAWBjvfAgKFFIFKBFQFLfjqSJY05bO4fGa/OUhSRsrBnmOzn9+RAghsB4v+3zer0q43CiIEyw11agPAnGbjC76acgSBQhiQAmQZwQtiIFZYCINQgaJAo2LqnGvuamhm9SJLMCSgAlEDKBY82DkiQRV00zJkakCjKpdVyPW4Uyptf4iXn+6Exlg4W2tCs5BJDBTvcGVlIg4kNIFYMyxd7q9tLYt31SR0L3/1VrEQOwDor65bu+NM251B9NapX6arFEk4mftyTKLEDKr8eAATpkYDoAk0HHCEQURhHGvOVNoZzi/WYdi4iQpmkA1jxoZN0NOaTYdZaRIu2EAJgS6ypzp7qiURGu1Bpm4BMBMfJWkwKBMoy0N8B3t1/HCMBf9/4QbBYxjHags/QG1/Gm2o5oHMzlLNYmt0jbWhq1OufdZQ24cIuSQptpbM3vpQw3cZNcFEKghOFqbWyGAkFDoS+E/+xfwbY26B8SrIwURmIrdXIxPLN7QGot36p1GjjWvEAlkpvxTscaiyJKxUCrpLTkroCKbuNy3DlzIuRdSUnABPTSQ/ju0Vdg1BDajDDqbIFUDOHCoyEzAWq8UNatqc2isDVWoZuHHEWJhYQwjDFFwYJha+o7rpNbVwRRBFbW2VnnS1I0ntBndRwFJg2mCIYUWGkwKaQKSGHwSHIEJ0fHIKaDYeaBFxfvq2QzVFshzXLjTPJzBY51AJSmaf6FCyQvrmjMo9nDyJr6ph1FnDEHCwTDjKURmoPf1XL9Mqhogrhs9/Svdnre/TCNFF7tZq/6DAJJpEEdE9RlJ5CDE4234C7nevFEC9Qv/6pzogZgzYl2dwsglF0HhWKOhmlbdZ2M67QhY0zGFaVRFNleDhV9DuNV1LbkXhq7+fm48UHp4pZBFM5XdYfsIQmummteUtxRzmxgZhg2SJIkzyStBSZ0w8pMmbN54KjnPlR6TrkeaHKABWDNUceyivusxjtq/FaeJVlqPUl5/9CFhQUo3eBD8rLwSu8R58FpdzzSs33NfnKgA7MfsgrAOkDqdg0LigZoYJt7LkqBKdeGSuKwpLtw0UPU6mg2RuiKMOw5Ug5Eoyb3vEH3UWydrbarX9YRcGxgeUM2KRfhIxIFEgVNIaQzTydWyYHoQOKyEAhNXV2Kng3jxydxtppepk1DmrwysVIHL6fw7zELIyjvcyTOcrFE7NA4IRQ9srLX1LQ5ZIphAoQsv70+GDyxVyg1xfhQ6/og7D21J7SKnDvDyhyOrhAURUGo34Cj6c4nQqnfaFGEgVqz/3bbI/lJfvcLtc/dMMHH40fnym9JA9hwy0MIpMGuq/4da9UJbnWERlu5VvuKKYZ2gEBe0InC313Wnpo4lv8JN+V0774icjNzAHBetFq0J6qL+03SmSgA687S8eNLQwApSwrDqR07wgYEzntZWcCoxo30O+sRaduvCgJWWaWz8kq8mLw5OZTHI0EaHWJELOhDQ4jQyXK4HHcyGYCZynn0JT+XZK27K8vUIJdE2kpqnfet1+uJcwUwm5q7evadoLwTjJcT5SvbYt0HmrPf+UbbGGF3cBgDWUQ/6qNrdhGlugA0jRuQjaVnVPPwOHLgWPP3OtwWFW0c/QZpVOpX5bgGZYxQKHutDAbdXVBE6AqQEsFELmvLS8PJfA57mUbhzssEdQDWfOiB2tQXf3zvXjYvB5hX5u5nnSoPwSxsRZ4QhnGCv+NzODSK8Oedl7EghzBSO1C+CaFobMrE2ByghgQHUTb9hlQ7dawWBqI28v5VNhSzf1XHjtXkKc5SqPiGbD5XavvzYQjCW1uX8NbWRewqQYQIypjcgKiaClNdEg3Gho6C531u5BrPWl8U74tYzPWqOreCE2fZ6xEEvXQR3z3yx+iZEZY4wc1oE12OARhvlN305GS/e+AYuAjQOgrAmp9uZev1uJRkNwa/TPT41qEaczmUM06pVFpvFGAU5x36CEBENryYmhRfkgehRWCEESEr9YoyniUFUJ0e57scXNZC4whfqvSeD8CaC7TGJjhMF4e3JvUlE4HZX82bhZAAIzYgASIoKHG5WNP9UbMOEg/tuOdIg8GAisHhk2oEJw9xumUdLG/dTohIZd1mBFxAvnFNNNZ2kia7QmQf1x6U98l05cqVrjGpZnYaSf3dX4Rrsg0SQl0nM5caTCAoNV7/5/xKDMl/G8naRJIbD0x58LsOVJOswlx5r41tSkWUB451YGSMIWbJG6NNVsUnqeUYc1eUe71PFk/OaGAUzdeqAIKnWyml8sfsok+gdcggnQvZxmvi+ZqkAVBUVpTq2HXWeNZvNKu0yl87QFSHVhIRFNvkQPE5kSIYTnNXiDE2MtDpdNDpdPJeWLO4R1w0IKQmz4m63eNDETLO/Oc8Ec8WDiqlwJnXcRbpYcFD6MYd8GIPN24Qtnc2MRjuYpgMMBgMSr24/Adgq3D8mc/D4TD/zOLiIh577DFsbm5iZWVlrMlbtTTsXqLWAesLX+hZwZPNtxnrZeXVAhI1l3W5/gqOI3W7XSwsLKDT6WA4HMAYg/X1dWitxzrvRVGUc6AoihDHcc5Zjhw5kneI0Vrj8uXL2Q3RxWAwqO0aWGclOrEZshvm7m7gYorpWH47Nc5cFg90/jmdTgefffYZXnjhBTz11FNI0xTb29vFlIqsfMuvZnZlYv6YFBHJK3x2dnawsrKCJ554AqPRqASUumRCqqmeDgME5kQbGxv4zUezuc4ljYryDfG5S5M/yX/fGIOHH34Yly9fxptvvokoirC4uIg0TTEcDmGMQRzHJV3J9XB3xxxn63Q66PV6+TG//0JV/JWNgfEOhfb8IArvOBfDHosV/E02xuDZZ58t1RE6MNQNAKhafeNZo7ZMbRblu07HarvedQ8BC2NcYZYNLer3GEmSoNPp1BZT1E2493WjOuenb0VO46DVG8KJQqWCjjUnUQgABiIpRAxMFpBWgmxiBCHN+1plos5PqWkQiYXokVqQTm6eVhybBOymMvtJXMwv5d/P/vEHfoO3X/yVzT1XqVPtymA95NPFYpOorONCVV9XY9PaPc7RKd35UYQHHnigfZLj3hGCrhtppcGts/4qPaumice6BL0qd9rrtW6FOp0Yjz/+eBCFB00PPFAxz8nzTblCB0V5RgJQON6b5ufMDN0ZwDGpbdGtgCuKdCs51j2nvOfMyxtIIV5RgjqAGTcHJujFxgoDsO5CUN0JQOwnsIgCsOZkFW6UcZThxGRZMXnBaNWSqqmSmUn3aRwaOJ+JEXZ9AVh33Eb0+zegoYNMq6wrRWghw7rHRKFILaBQ5V5tkOi5NRrSZuaqe1Q3oD6LYdwJul/AOiiAVrmr5VjBj3WX3/1tDI+EnPdWgKst65w2SCqIwgO5h/Pm7mP6k59Et6dNabT+Gq4hDRXKxNhrDtW0OdUBWPckyRQxJaXffnJem1s9BlF4V4BuL50a7g9qKceiRouvjeKjLivCHQ9dk+9ZrX++I0cmD3UKwLp/cbiP7oEsg5QDsOYoOsYmkFTuboLeH3WnyVps2u+mUSgzGAdZQbWtMyI23W5H3bixcWh1dTUA6/7R26neQKxwr8JmLKa5ZicyEYkQQ5ESLxs10lqh242jfr+Pixcvnn3nnXe2XnvtNU1EJgDrPjOohV21jgEInPc1VYoBIIq0CEuklCKlFDpxRymVdWwWW9HT7/dx/fr1fr/f729vb77/9ttv//O3vvWtfxARImqXSLwngDUmBsmV2M8+IrdZ7MKfOy2FVQohIvYcs6SUgu5o1Yki5WoPRaxsHA6H2O5vYzAYYGtrC/3+7idLS0v/fe3aVXXlypX3jx49+ot33nlHffrppz/++c8/uPHeez+5ka1PtQ1UgWPVA038jSRSQgRXfBoREbTW0FqR0kqJCExq0O/3MRzu4vpn1xHH8YXNzZty5cqVjYcfPvrj3d3dwfnz5wHof+319Odraz+jH/7wX64CuDFhHbS6uqraJP7uBeV95jnxNZwt92IqpZgUieU3FCmtEHc6pHWkSVlWZZhhUoPtnW3sbG8PmHmwublJV69d3Xjo6INrVz+7Sh9f+uj6bz366I+uXdtIz517Y/sHP3jt7WmLy8r187jQ2toara2tAQCfOXNGsv/RtPUGbR2wRqMRMadKJBVAxA6KVAQoYWNVZCKIIvtONpSSdFYSryOllVKklQayUYKDfh8bN65je2cbmzdvfn748PL5zz+/Th9//D/pQw899HqSJDffffdds7Oz89by8vLnq6urWF9fHwIYTAEOAdBra2v48MMP6etf/7o5c+YMAODs2bPSxI3Onj3bes4ftYhLAQD99Kc/NS+++KI5duwYKaUpijQ6Hc3GWL0ma/BBURQpV02cJIlVjDe2sL29dUNErl66dImXlpZ/lCSjm++990tDRD+6cOHC1ve///0bAK5OVd2VwhtvvJF/f9euXRMAWF1dxerqqsl0LwGQunO+8Y1v3DcqRZs4lrz22mv6lVde2fr1r3/9t3Ec/5UxRtbXL/YeeeSR3nA47IvIcGdnhzY2Nq4sLy//YmtrO7l48SL1+9vvHD164ldvvvkT9frrr3/4ySef/O8UkVkSUdnvXEw5oL/88stp0EobGEFbF/7888+vPPXUU90rV24eOnZs+bePHz/+y2PHjm2eO3cO586d6wMYTeJ+WSOQ6NVXX6XTp0/L2toaOxGFEEm+P4GV+XVkkpgyxkQZl8lF1eoq8PTT78vZs2c5bH0AVuPaRQRnzpyhZ555ht5//33xxVTgOoECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQo0f/p/7woAaVZDaeIAAAAASUVORK5CYII=",
        extend: [
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            romasku.deviceConfig("device_config"),
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
            romasku.deviceConfig("device_config"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            romasku.deviceConfig("device_config"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, } }),
            romasku.deviceConfig("device_config"),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            romasku.deviceConfig("device_config"),
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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.generalIndicatorMode("indicator_mode", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "l1": 4, "l2": 5, "l3": 6, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [4, 5, 6]),
            romasku.generalIndicatorMode("indicator_mode", [4, 5, 6]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
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
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);
            const endpoint5 = device.getEndpoint(5);
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"l1": 1, } }),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [1]),
            romasku.generalIndicatorMode("indicator_mode", [1]),
        ],
        meta: { multiEndpoint: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint1, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint1.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "button_3": 3, "button_4": 4, "l1": 5, "l2": 6, "l3": 7, "l4": 8, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.networkIndicator("network_led", "button_1"),
            romasku.relayLights(["l1", "l2", "l3", "l4"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [5, 6, 7, 8]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
            romasku.pressAction("button_3_press_action", "button_3"),
            romasku.switchAction("button_3_action_mode", "button_3"),
            romasku.decouple("button_3_decouple", "button_3"),
            romasku.pressAction("button_4_press_action", "button_4"),
            romasku.switchAction("button_4_action_mode", "button_4"),
            romasku.decouple("button_4_decouple", "button_4"),
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
            await reporting.bind(endpoint5, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint5, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint5.read("genOnOff", ["onOff"]);
            const endpoint6 = device.getEndpoint(6);
            await reporting.bind(endpoint6, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint6, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint6.read("genOnOff", ["onOff"]);
            const endpoint7 = device.getEndpoint(7);
            await reporting.bind(endpoint7, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint7, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint7.read("genOnOff", ["onOff"]);
            const endpoint8 = device.getEndpoint(8);
            await reporting.bind(endpoint8, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint8, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint8.read("genOnOff", ["onOff"]);



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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "l1": 2, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [2]),
            romasku.generalIndicatorMode("indicator_mode", [2]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
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
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint2, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint2.read("genOnOff", ["onOff"]);

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
            deviceEndpoints({ endpoints: {"button_1": 1, "button_2": 2, "l1": 3, "l2": 4, } }),
            romasku.childLockEnabled("child_lock_enabled"),
            romasku.childLock("child_lock"),
            romasku.deviceConfig("device_config"),
            romasku.relayLights(["l1", "l2"]),
            romasku.generalPowerOnBehavior("power_on_behavior", [3, 4]),
            romasku.generalIndicatorMode("indicator_mode", [3, 4]),
            romasku.pressAction("button_1_press_action", "button_1"),
            romasku.switchAction("button_1_action_mode", "button_1"),
            romasku.decouple("button_1_decouple", "button_1"),
            romasku.pressAction("button_2_press_action", "button_2"),
            romasku.switchAction("button_2_action_mode", "button_2"),
            romasku.decouple("button_2_decouple", "button_2"),
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
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint3, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint3.read("genOnOff", ["onOff"]);
            const endpoint4 = device.getEndpoint(4);
            await reporting.bind(endpoint4, coordinatorEndpoint, ["genOnOff"]);
            await reporting.onOff(endpoint4, {
                min: 0,
                max: constants.repInterval.HOUR, // heartbeat: report state at least hourly
                change: 1,
            });
            // Read the current relay state so HA shows it right after
            // interview/reconfigure, without waiting for the first change/heartbeat.
            await endpoint4.read("genOnOff", ["onOff"]);

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
