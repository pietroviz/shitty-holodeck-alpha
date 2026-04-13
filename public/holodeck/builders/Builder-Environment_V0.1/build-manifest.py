#!/usr/bin/env python3
"""
Scan global_assets/ and produce asset-manifest.json — a lightweight index
the browser app loads at startup so it knows what's available without
fetching every individual JSON file.
"""

import json, os, sys
from pathlib import Path

ASSETS_DIR = Path(__file__).parent / "global_assets"
OUT_FILE = Path(__file__).parent / "asset-manifest.json"

def scan():
    entries = []
    for json_path in sorted(ASSETS_DIR.rglob("*.json")):
        rel = json_path.relative_to(ASSETS_DIR.parent)
        try:
            data = json.loads(json_path.read_text())
        except Exception as e:
            print(f"  SKIP {rel}: {e}", file=sys.stderr)
            continue

        # Determine dimension (2D vs 3D) from path
        parts = rel.parts  # e.g. ('global_assets', '3D', 'props', 'nature', 'file.json')
        dimension = parts[1] if len(parts) > 1 else "unknown"

        # Determine category from folder name
        category = parts[-2] if len(parts) > 2 else "uncategorized"

        # Determine asset kind from subfolder
        kind = parts[2] if len(parts) > 2 else "unknown"  # props, primitives, palettes, emojis, etc.

        entry = {
            "id": data.get("id", json_path.stem),
            "name": data.get("name", json_path.stem),
            "tags": data.get("tags", []),
            "dimension": dimension,       # "2D" or "3D"
            "kind": kind,                 # "props", "primitives", "palettes", "emojis", etc.
            "category": category,         # "nature", "urban", "headwear", etc.
            "path": str(rel),             # relative path for fetching
        }

        # Include element count if available
        payload = data.get("payload", {})
        editor = payload.get("_editor", {})
        elements = editor.get("elements", [])
        if elements:
            entry["elementCount"] = len(elements)

        # Include description snippet
        desc = payload.get("description", data.get("description", ""))
        if desc:
            entry["description"] = desc[:120]

        entries.append(entry)

    return entries

if __name__ == "__main__":
    print(f"Scanning {ASSETS_DIR} ...")
    entries = scan()
    manifest = {
        "version": 1,
        "generated": True,
        "assetCount": len(entries),
        "assets": entries,
    }
    OUT_FILE.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {len(entries)} entries to {OUT_FILE}")
