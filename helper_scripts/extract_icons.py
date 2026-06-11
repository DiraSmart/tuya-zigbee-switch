"""Extract `model` + `icon` (base64 data URI) from DiraSmart .mjs converters
and write them to dirasmart_icons.json (used to brand the custom-FW converter).

Usage:
    python helper_scripts/extract_icons.py <folder-with-mjs-files>

It scans every *.mjs in the folder, reads its `model:` and `icon:` values, and
writes {model: icon} to helper_scripts/dirasmart_icons.json.
"""
import json
import re
import sys
from pathlib import Path

folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
out = Path(__file__).parent / "dirasmart_icons.json"

icons = {}
for mjs in sorted(folder.glob("*.mjs")):
    text = mjs.read_text(encoding="utf-8")
    model = re.search(r"model:\s*'([^']+)'", text)
    icon = re.search(r"icon:\s*'(data:[^']+)'", text)
    if model and icon:
        icons[model.group(1)] = icon.group(1)
        print(f"{mjs.name}: {model.group(1)} ({len(icon.group(1))} chars)")
    else:
        print(f"{mjs.name}: no model/icon found, skipped")

out.write_text(json.dumps(icons, indent=2))
print(f"Wrote {len(icons)} icon(s) to {out}")
