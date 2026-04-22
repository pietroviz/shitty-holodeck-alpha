#!/usr/bin/env python3
"""
generate-thumbnails.py — Generate thumbnail images for stock assets.

Reads asset JSON files from public/holodeck/global_assets/ and renders
simplified 2D thumbnails using each asset's actual colors. Saves them
as JPEG files in public/holodeck/thumbnails/.

Usage:
    python3 scripts/generate-thumbnails.py                  # All asset types
    python3 scripts/generate-thumbnails.py characters       # Characters only
    python3 scripts/generate-thumbnails.py objects           # Objects only
    python3 scripts/generate-thumbnails.py environments      # Environments only

Run this whenever the asset library is updated (new items, color changes, etc.)
The generated thumbnails are committed to the repo and deployed with the site.

Requirements: Python 3, Pillow (pip install Pillow)
"""

import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw

# ── Paths ────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ASSETS_DIR = PROJECT_ROOT / "public" / "holodeck" / "global_assets"
THUMBS_DIR = PROJECT_ROOT / "public" / "holodeck" / "thumbnails"

THUMB_SIZE = 128
JPEG_QUALITY = 85

# ── Character config (mirrors shared/charConfig.js) ──────────
BODY_HEIGHT = {"squat": 0.50, "medium": 0.72, "tall": 0.95}
BODY_WIDTH = {"narrow": 0.476, "moderate": 0.652, "wide": 0.85}
HEAD_HEIGHT = {"squat": 0.44, "medium": 0.58, "tall": 0.72}
HEAD_WIDTH = {"narrow": 0.40, "moderate": 0.55, "wide": 0.72}
FLOAT_HEIGHT = 0.15
NECK_GAP = 0.02

DEFAULT_COLORS = {
    "scalp": "#8b2020",
    "skin": "#ffcc88",
    "torso": "#7b4daa",
    "bottom": "#3a2870",
    "eyeIris": "#4a7a8c",
}

# Background color (matches the 3D scene builder background)
BG_COLOR = "#1A1A2E"
GROUND_COLOR = "#2a2a45"


def hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple."""
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def lighten(hex_color, factor=0.15):
    """Lighten a color slightly for highlights."""
    r, g, b = hex_to_rgb(hex_color)
    r = min(255, int(r + (255 - r) * factor))
    g = min(255, int(g + (255 - g) * factor))
    b = min(255, int(b + (255 - b) * factor))
    return (r, g, b)


def darken(hex_color, factor=0.2):
    """Darken a color slightly for shadows."""
    r, g, b = hex_to_rgb(hex_color)
    return (int(r * (1 - factor)), int(g * (1 - factor)), int(b * (1 - factor)))


# ── Character Thumbnail ─────────────────────────────────────

def draw_character(asset):
    """Draw a simplified character thumbnail from asset JSON."""
    state = asset.get("payload", {}).get("state", {})

    # Get proportions (normalized to thumbnail space)
    body_h_raw = BODY_HEIGHT.get(state.get("heightPreset", "medium"), 0.72)
    body_w_raw = BODY_WIDTH.get(state.get("widthPreset", "moderate"), 0.652)
    head_h_raw = HEAD_HEIGHT.get(state.get("headHeightPreset", "medium"), 0.58)
    head_w_raw = HEAD_WIDTH.get(state.get("headWidthPreset", "moderate"), 0.55)

    # Scale factor: fit character into ~80% of thumbnail height
    total_h = FLOAT_HEIGHT + body_h_raw + NECK_GAP + head_h_raw
    scale = (THUMB_SIZE * 0.78) / total_h

    body_h = body_h_raw * scale
    body_w = body_w_raw * scale
    head_h = head_h_raw * scale
    head_w = head_w_raw * scale

    # Colors (handle None/null values from JSON)
    torso_color = state.get("torsoColor") or DEFAULT_COLORS["torso"]
    bottom_color = state.get("bottomColor") or DEFAULT_COLORS["bottom"]
    skin_color = state.get("skinColor") or DEFAULT_COLORS["skin"]
    scalp_color = state.get("scalpColor") or DEFAULT_COLORS["scalp"]
    iris_color = state.get("eyeIrisColor") or DEFAULT_COLORS["eyeIris"]

    # Create image
    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), hex_to_rgb(BG_COLOR))
    draw = ImageDraw.Draw(img)

    # Ground line
    ground_y = THUMB_SIZE - 10
    draw.rectangle([0, ground_y, THUMB_SIZE, THUMB_SIZE], fill=hex_to_rgb(GROUND_COLOR))

    # Center X
    cx = THUMB_SIZE // 2

    # Body position (bottom sits on ground)
    float_px = FLOAT_HEIGHT * scale
    body_bottom = ground_y - float_px
    body_top = body_bottom - body_h

    # Draw body (rounded rectangle)
    body_left = cx - body_w / 2
    body_right = cx + body_w / 2
    body_radius = min(body_w * 0.2, 8)

    # Bottom portion of body (lower ~25%)
    split_y = body_bottom - body_h * 0.25
    draw.rounded_rectangle(
        [body_left, body_top, body_right, body_bottom],
        radius=body_radius,
        fill=hex_to_rgb(torso_color),
    )
    # Bottom color zone
    draw.rectangle(
        [body_left, split_y, body_right, body_bottom],
        fill=hex_to_rgb(bottom_color),
    )
    # Re-round just the bottom corners
    draw.rounded_rectangle(
        [body_left, split_y, body_right, body_bottom],
        radius=body_radius,
        fill=hex_to_rgb(bottom_color),
    )
    # Redraw top portion to cover overlap
    draw.rounded_rectangle(
        [body_left, body_top, body_right, split_y + body_radius],
        radius=body_radius,
        fill=hex_to_rgb(torso_color),
    )

    # Head position
    neck_px = NECK_GAP * scale
    head_bottom = body_top - neck_px
    head_top = head_bottom - head_h
    head_cx = cx
    head_cy = (head_top + head_bottom) / 2

    # Draw head (ellipse)
    head_left = head_cx - head_w / 2
    head_right = head_cx + head_w / 2
    draw.ellipse(
        [head_left, head_top, head_right, head_bottom],
        fill=hex_to_rgb(skin_color),
    )

    # Scalp (top ~35% of head)
    scalp_bottom = head_top + head_h * 0.35
    # Draw scalp as a clipped ellipse (just redraw the top portion)
    scalp_img = Image.new("RGBA", (THUMB_SIZE, THUMB_SIZE), (0, 0, 0, 0))
    scalp_draw = ImageDraw.Draw(scalp_img)
    scalp_draw.ellipse(
        [head_left, head_top, head_right, head_bottom],
        fill=hex_to_rgb(scalp_color) + (255,),
    )
    # Mask out below scalp line
    scalp_draw.rectangle(
        [0, scalp_bottom, THUMB_SIZE, THUMB_SIZE],
        fill=(0, 0, 0, 0),
    )
    img.paste(scalp_img, mask=scalp_img)

    # Eyes
    eye_spacing = head_w * 0.22
    eye_y = head_cy + head_h * 0.02
    eye_radius = max(3, head_w * 0.09)
    iris_radius = eye_radius * 0.55

    for x_sign in [-1, 1]:
        ex = head_cx + x_sign * eye_spacing
        # White sclera
        draw.ellipse(
            [ex - eye_radius, eye_y - eye_radius, ex + eye_radius, eye_y + eye_radius],
            fill=(255, 255, 255),
        )
        # Iris
        draw.ellipse(
            [ex - iris_radius, eye_y - iris_radius, ex + iris_radius, eye_y + iris_radius],
            fill=hex_to_rgb(iris_color),
        )
        # Pupil
        pupil_r = iris_radius * 0.5
        draw.ellipse(
            [ex - pupil_r, eye_y - pupil_r, ex + pupil_r, eye_y + pupil_r],
            fill=(15, 15, 15),
        )

    return img


# ── Prop/Object Thumbnail ───────────────────────────────────

def draw_prop(asset):
    """Draw a simplified prop thumbnail — shows primary color block."""
    payload = asset.get("payload", {})
    primary = payload.get("primaryColor", "#888888")
    elements = payload.get("_editor", {}).get("elements", [])

    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), hex_to_rgb(BG_COLOR))
    draw = ImageDraw.Draw(img)

    # Ground
    ground_y = THUMB_SIZE - 10
    draw.rectangle([0, ground_y, THUMB_SIZE, THUMB_SIZE], fill=hex_to_rgb(GROUND_COLOR))

    cx, cy = THUMB_SIZE // 2, THUMB_SIZE // 2 - 5

    if elements:
        # Draw a simplified representation based on the first few elements
        color_map = payload.get("_editor", {}).get("color_assignments", {})
        for el in elements[:6]:  # Limit to first 6 elements
            p = el.get("params", {})
            fill_key = p.get("fill", "primary")
            if fill_key == "primary":
                color = primary
            elif fill_key in color_map:
                color = color_map[fill_key]
            elif isinstance(fill_key, str) and fill_key.startswith("#"):
                color = fill_key
            else:
                color = primary

            # Map 3D positions to 2D (simple orthographic)
            px = cx + p.get("px", 0) * 50
            py = cy - p.get("py", 0) * 50
            prim = el.get("primitiveId") or el.get("primitive", "box")

            size = max(p.get("width", p.get("radius", 0.3)), 0.15) * 45

            if prim in ("sphere", "capsule"):
                draw.ellipse([px-size, py-size, px+size, py+size], fill=hex_to_rgb(color))
            elif prim in ("cylinder", "cone"):
                draw.ellipse([px-size, py-size*0.6, px+size, py+size*0.6], fill=hex_to_rgb(color))
            else:  # box and others
                draw.rounded_rectangle(
                    [px-size, py-size, px+size, py+size],
                    radius=3, fill=hex_to_rgb(color),
                )
    else:
        # No elements — just show a colored cube
        size = 25
        draw.rounded_rectangle(
            [cx-size, cy-size, cx+size, cy+size],
            radius=4, fill=hex_to_rgb(primary),
        )

    return img


# ── Environment Thumbnail ────────────────────────────────────

def _draw_blank_template():
    """Blank environment template — matches the in-app Scene3D look."""
    BG, GRID, PERIM, INNER = (0x5A,0x5A,0x5A), (0x2F,0x2F,0x2F), (0xC8,0xC8,0xC8), (0xB0,0xB0,0xB0)
    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), BG)
    d = ImageDraw.Draw(img)
    step = max(1, THUMB_SIZE // 21)
    for i in range(0, THUMB_SIZE, step):
        d.line([(i, 0), (i, THUMB_SIZE)], fill=GRID, width=1)
        d.line([(0, i), (THUMB_SIZE, i)], fill=GRID, width=1)
    pad = THUMB_SIZE * 0.22
    left, top = int(pad), int(pad + THUMB_SIZE * 0.08)
    right, bottom = THUMB_SIZE - int(pad), THUMB_SIZE - int(pad - THUMB_SIZE * 0.04)
    for k in range(1, 5):
        x = left + (right - left) * k / 5
        d.line([(x, top), (x, bottom)], fill=INNER, width=1)
        y = top + (bottom - top) * k / 5
        d.line([(left, y), (right, y)], fill=INNER, width=1)
    d.rectangle([left, top, right, bottom], outline=PERIM, width=2)
    return img


def draw_environment(asset):
    """Draw a simplified environment thumbnail — sky + ground colors."""
    payload = asset.get("payload", {})
    state = payload.get("state", {})

    # Blank template: render the Scene3D look (grey backdrop + stage
    # perimeter + inner grid) instead of sky/ground.
    origin = asset.get("meta", {}).get("origin")
    is_blank_template = (
        asset.get("id") == "env_default"
        or (origin == "template" and not state)
    )
    if is_blank_template:
        return _draw_blank_template()

    sky_color = state.get("skyColor", payload.get("skyColor", "#87CEEB"))
    ground_color = state.get("groundColor", payload.get("groundColor", "#4a7a4a"))

    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), hex_to_rgb(sky_color))
    draw = ImageDraw.Draw(img)

    # Ground (bottom 40%)
    horizon = int(THUMB_SIZE * 0.6)
    draw.rectangle([0, horizon, THUMB_SIZE, THUMB_SIZE], fill=hex_to_rgb(ground_color))

    # Horizon line (subtle blend)
    blend = lighten(ground_color, 0.1)
    draw.line([(0, horizon), (THUMB_SIZE, horizon)], fill=blend, width=2)

    return img


# ── Voice Thumbnail ──────────────────────────────────────────

def draw_voice(asset):
    """Draw a stylised face thumbnail using the voice's face/scalp/lip
    colors — mirrors the in-app mouth preview so each voice reads as
    itself at a glance."""
    state = asset.get("payload", {}).get("state", {})

    face_hex  = state.get("faceColor")  or "#e0c8b0"
    scalp_hex = state.get("scalpColor") or "#4a3a2a"
    lip_hex   = state.get("lipColor")   or "#b05060"
    show_lips = state.get("showLips", True)

    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), hex_to_rgb(BG_COLOR))
    draw = ImageDraw.Draw(img)

    cx = THUMB_SIZE // 2
    cy = THUMB_SIZE // 2
    head_w = 72
    head_h = 92
    left   = cx - head_w // 2
    right  = cx + head_w // 2
    top    = cy - head_h // 2
    bottom = cy + head_h // 2

    # Face
    draw.ellipse([left, top, right, bottom], fill=hex_to_rgb(face_hex))

    # Scalp cap (top ~45% of head)
    scalp_bottom = top + int(head_h * 0.45)
    scalp_layer = Image.new("RGBA", (THUMB_SIZE, THUMB_SIZE), (0, 0, 0, 0))
    scalp_draw = ImageDraw.Draw(scalp_layer)
    scalp_draw.ellipse([left, top, right, bottom], fill=hex_to_rgb(scalp_hex) + (255,))
    scalp_draw.rectangle([0, scalp_bottom, THUMB_SIZE, THUMB_SIZE], fill=(0, 0, 0, 0))
    img.paste(scalp_layer, mask=scalp_layer)

    # Eyes — small dark ovals on either side
    eye_y = cy - head_h * 0.05
    eye_dx = head_w * 0.22
    eye_rx, eye_ry = 4, 5
    eye_color = darken(face_hex, 0.7)
    for sign in (-1, 1):
        ex = cx + sign * eye_dx
        draw.ellipse([ex - eye_rx, eye_y - eye_ry, ex + eye_rx, eye_y + eye_ry],
                     fill=eye_color)

    # Lips — horizontal bar positioned in lower third
    if show_lips:
        lip_y = cy + head_h * 0.28
        lip_w = head_w * 0.48
        lip_h = 6
        draw.rounded_rectangle(
            [cx - lip_w / 2, lip_y - lip_h / 2,
             cx + lip_w / 2, lip_y + lip_h / 2],
            radius=3, fill=hex_to_rgb(lip_hex),
        )

    return img


# ── Fallback Thumbnail (music, other) ────────────────────────

def draw_fallback(asset):
    """Draw a simple colored circle for music/other assets."""
    type_colors = {"voice": "#7eb8c9", "music": "#c97eb8", "image": "#b8c97e"}
    color = type_colors.get(asset.get("type", ""), "#888888")

    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), hex_to_rgb(BG_COLOR))
    draw = ImageDraw.Draw(img)

    cx, cy = THUMB_SIZE // 2, THUMB_SIZE // 2
    r = 30
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=hex_to_rgb(color))

    return img


# ── Dispatch ─────────────────────────────────────────────────

RENDERERS = {
    "character": draw_character,
    "prop": draw_prop,
    "object": draw_prop,
    "environment": draw_environment,
    "voice": draw_voice,
    "music": draw_fallback,
}


# ── Main ─────────────────────────────────────────────────────

def process_folder(folder_name):
    """Process all assets in a given global_assets subfolder."""
    folder = ASSETS_DIR / folder_name
    manifest_path = folder / "manifest.json"

    if not manifest_path.exists():
        print(f"  Skipping {folder_name} — no manifest.json")
        return 0

    with open(manifest_path) as f:
        manifest = json.load(f)

    count = 0
    categories = manifest.get("categories", {})

    for cat_key, cat_data in categories.items():
        cat_folder = folder / cat_key
        for filename in cat_data.get("files", []):
            filepath = cat_folder / filename
            if not filepath.exists():
                continue

            with open(filepath) as f:
                asset = json.load(f)

            asset_id = asset.get("id", filepath.stem)
            asset_type = asset.get("type", folder_name.rstrip("s"))  # "characters" -> "character"
            renderer = RENDERERS.get(asset_type)

            if not renderer:
                print(f"    Skipping {asset_id} — unknown type '{asset_type}'")
                continue

            try:
                img = renderer(asset)
                out_path = THUMBS_DIR / f"{asset_id}.jpg"
                img.save(out_path, "JPEG", quality=JPEG_QUALITY)
                count += 1
            except Exception as e:
                print(f"    ERROR {asset_id}: {e}")

    return count


def main():
    # Determine which folders to process
    if len(sys.argv) > 1:
        folders = sys.argv[1:]
    else:
        folders = ["characters", "objects", "environments", "voices", "music"]

    # Ensure output directory exists
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Thumbnail Generator")
    print(f"  Assets: {ASSETS_DIR}")
    print(f"  Output: {THUMBS_DIR}")
    print(f"  Size:   {THUMB_SIZE}x{THUMB_SIZE} JPEG (quality {JPEG_QUALITY})")
    print()

    total = 0
    for folder in folders:
        print(f"Processing {folder}...")
        n = process_folder(folder)
        print(f"  Generated {n} thumbnails")
        total += n

    print(f"\nDone! {total} thumbnails saved to {THUMBS_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
