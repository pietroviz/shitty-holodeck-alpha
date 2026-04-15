# Environment Builder — Design Notes

A running design doc for the rebuilt environment builder. Started April 14, 2026 when we scrapped the old bridge and rebuilt from the Scene3D blank slate.

## The blank-slate template

The "Default" environment (`env_default`) is the canonical starting point. It renders the Scene3D look: mid-grey backdrop (`#5A5A5A`), 21×21 world grid, 5×5 stage perimeter (thick light-grey Line2), inner stage grid lines, flat lighting (ambient + one directional). No placeholder cube. This is the look every new environment starts from.

Lives at `public/holodeck/global_assets/environments/templates/env_default.json`, registered in the `templates` category of `environments/manifest.json`. Will be removed from the menu once the builder is mature enough that users start from a fresh "New Environment" button instead.

## Current tabs

Only the File tab is wired. The rest are stubs we'll fill in together.

- **File** — name, description, tags (wired)
- **Ground** — stub
- **Sky** — stub
- **Walls** — stub
- **Music** — stub

## Features from the legacy builder (`EnvironmentBridge.legacy.js`)

Kept for reference. We'll bring these back one at a time, with intention, as Pietro calls them in. Not a commitment to re-implement all of them.

### Ground
- Ground color picker (defaulted to `#4a6741`)
- Rendered as a 5×5 PlaneGeometry overlay on the Scene3D stage

### Sky
- Two-stop gradient background: `skyTopColor` + `skyHorizonColor`
- Defaults: `#87ceeb` top, `#e0f6ff` horizon

### Walls
- `wallCount` slider (0–N), auto-arranged around the stage
- Wall color/material not fully parameterized in the legacy version

### Music
- `musicId` picker, pulled from the global music asset library
- Live audio preview via `MusicEngine`

### Props (object placement)
- "Add Prop" browse panel pulled from the object asset library
- Placed THREE.Group instances tracked in `_propGroups`
- Per-prop position/rotation/scale editing (via `ObjectBridge` drill-down)

### Images (image sprites)
- "Add Image" browse panel pulled from the image asset library
- Sprite meshes tracked in `_imageSprites`
- Per-image position/rotation/scale editing (via `ImageBridge` drill-down)

## Open questions / decisions to revisit

- **Lighting.** The Scene3D flat lighting is the current baseline. We may want a small lighting-mood selector (e.g. Neutral / Warm / Cool / Dramatic) as its own tab or as part of Sky.
- **Stage size.** 5×5 is the canonical stage. Should envs ever change stage dimensions, or is that fixed by the engine?
- **Default save behavior.** Editing the "Default" template currently saves in place (it's a stock asset). When we promote Default out of the menu, we should decide whether the flow becomes "duplicate to new user env" automatically.
- **Props/Images tabs.** Legacy put these in one long flat panel; new build will tab them. Placement interaction (click-to-place vs drag vs spawn-at-origin) is still TBD.
