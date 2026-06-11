import argparse
import json
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

# Optional per-model branding icons (base64 data URIs), keyed by Z2M model name.
_ICONS_FILE = Path(__file__).parent / "dirasmart_icons.json"
ICONS = json.loads(_ICONS_FILE.read_text()) if _ICONS_FILE.exists() else {}

env = Environment(
    loader=FileSystemLoader("helper_scripts/templates"),
    autoescape=select_autoescape(),
    trim_blocks=True,
    lstrip_blocks=True,
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create Zigbee2mqtt converter for custom devices",
        epilog="Generates a js file that adds support of re-flashed devices to z2m",
    )
    parser.add_argument(
        "db_file", metavar="INPUT", type=str, help="File with device db"
    )
    parser.add_argument(
        "--z2m-v1", action=argparse.BooleanOptionalAction, help="Use old z2m"
    )

    args = parser.parse_args()

    db_str = Path(args.db_file).read_text()
    db = yaml.safe_load(db_str)

    devices = []

    for device in db.values():
        # Skip if build == no. Defaults to yes
        if not device.get("build", True):
            continue

        config = device["config_str"]
        zb_manufacturer, zb_model, *peripherals = config.rstrip(";").split(";")

        relay_cnt = 0
        switch_cnt = 0
        cover_switch_cnt = 0
        cover_cnt = 0
        indicators_cnt = 0
        has_dedicated_net_led = False
        has_battery_cluster = False
        for peripheral in peripherals:
            if peripheral == "SLP" or peripheral == "M":
                continue
            if peripheral[0] == "R":
                relay_cnt += 1
            if peripheral[0] == "S":
                switch_cnt += 1
            if peripheral[0] == "X":
                cover_switch_cnt += 1
            if peripheral[0] == "C":
                cover_cnt += 1
            if peripheral[0] == "I":
                indicators_cnt += 1
            if peripheral[0] == "L":
                has_dedicated_net_led = True
            if peripheral[:2] == "BT":
                has_battery_cluster = True

        # Endpoint naming scheme: "<gang><role>", role 1 = button, 2 = relay.
        # e.g. 11 = button gang1, 12 = relay gang1, 21 = button gang2, 22 = relay gang2, ...
        switch_names = [f"{index + 1}1" for index in range(switch_cnt)]
        relay_names = [f"{index + 1}2" for index in range(relay_cnt)]

        if cover_switch_cnt == 1:
            cover_switch_names = ["cover_switch"]
        elif cover_switch_cnt == 2:
            cover_switch_names = ["cover_switch_left", "cover_switch_right"]
        elif cover_switch_cnt == 3:
            cover_switch_names = [
                "cover_switch_left",
                "cover_switch_middle",
                "cover_switch_right",
            ]
        else:
            cover_switch_names = [
                f"cover_switch_{i + 1}" for i in range(cover_switch_cnt)
            ]

        if cover_cnt == 1:
            cover_names = ["cover"]
        elif cover_cnt == 2:
            cover_names = ["cover_left", "cover_right"]
        elif cover_cnt == 3:
            cover_names = ["cover_left", "cover_middle", "cover_right"]
        else:
            cover_names = [f"cover_{index}" for index in range(cover_cnt)]

        model_name = device.get("override_z2m_device") or device["stock_converter_model"]
        devices.append(
            {
                "zb_models": [zb_model] + (device.get("old_zb_models") or []),
                "model": model_name,
                "vendor": device.get("vendor"),
                "description": device.get("description"),
                "icon": ICONS.get(model_name),
                "switchNames": switch_names,
                "relayNames": relay_names,
                "relayIndicatorNames": relay_names[:indicators_cnt],
                "coverSwitchNames": cover_switch_names,
                "coverNames": cover_names,
                "has_dedicated_net_led": has_dedicated_net_led,
                "has_battery_cluster": has_battery_cluster,
            }
        )

    template = env.get_template("switch_custom.js.jinja")

    print(template.render(devices=devices, z2m_v1=args.z2m_v1))

    exit(0)
