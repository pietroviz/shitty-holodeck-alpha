# ImageBox V2 — Simbox Asset Builder

A browser-based SVG asset creation tool for the Simbox simulation engine. Generates, edits, and exports reusable 2D SVG assets as structured JSON following the Simbox item schema.

---

## The Big Picture

Simbox is a real-time simulation engine built entirely on web-native technologies — no external asset dependencies, no flat image files. The goal is simulations that load as pure code and synthesize fully in the browser. Everything is remixable down to its molecular level.

ImageBox is the creation tool for **2D SVG assets**: textures, flourishes, patterns, character parts, props, and scene objects. Because assets are SVG + JSON (not PNGs), they remain:
- **Editable** — any asset can be loaded back and modified
- **Recolorable** — colour role tokens, not hex values, so one asset can look completely different in different contexts
- **Composable** — characters, environments, and scenes reference assets by ID; nothing is embedded or duplicated
- **Code-only** — the entire system can theoretically reconstruct itself from JSON alone

---

## Architecture

### Files

| File / Folder | Purpose |
|------|---------|
| `index.html` | Main app — all UI, state, and interaction logic (single-file, no build step) |
| `primitives.js` | 2D shape library — loads JSON definitions, pairs with SVG renderers, ES module |
| `assets/primitives/2d/*.json` | Individual primitive shape definitions (16 files) |
| `assets/palettes/db32.json` | DawnBringer 32-colour palette — the global colour source |
| `assets/system-prompt.md` | System prompt template for AI generation (loaded at runtime) |
| `assets/emojis/` | 162+ batch asset JSON files across 8 categories, with `manifest.json` index |
| `start-server.command` | macOS double-click launcher — runs `npx serve . -p 5500` |
| `_refs/` | Reference materials — JSON schema examples, UI layout mockups |

### Colour System

The app uses a **3-role colour model** drawn from the DawnBringer 32 (DB32) palette:

- **Primary** (~50%) — the dominant colour
- **Secondary** (~30%) — supporting colour
- **Tertiary** (~20%) — accent colour
- **Background** — canvas/frame fill (separate from shape colours)

SVG shapes reference roles via CSS custom properties (`var(--primary)`, etc.), so swapping colours instantly re-skins the entire asset. Mini palette quick picks and a randomize button provide fast exploration.

### Primitive Library

Shape definitions live as individual JSON files in `assets/primitives/2d/`. Each contains metadata, default params, and a UI control schema. The `primitives.js` module loads them at init and pairs each with its SVG renderer function.

**Current primitives:** Circle, Square, Ellipse, Rectangle, Rounded Rect, Triangle, Pentagon, Hexagon, Diamond, 4-Point Star, 5-Point Star, 6-Point Star, Ring, Cross, Arc, Line

The library is designed to be shared across Simbox tools (character builder, environment editor, etc.).

### Frame Presets

Assets use a 512×512 canvas with a centered content frame. Five aspect ratio presets control the visible area:

| Preset | Dimensions | Ratio | Good for |
|--------|-----------|-------|----------|
| Wide | 448×252 | 16:9 | Panoramic scenes, environments, vehicles |
| Landscape | 432×324 | 4:3 | Buildings, wide objects, terrain features |
| Square | 400×400 | 1:1 | Icons, characters, standard objects |
| Portrait | 324×432 | 3:4 | Characters, animals, medium-tall objects |
| Tall | 252×448 | 9:16 | Towers, trees, tall narrow objects |

Legacy assets using the old `portrait` preset ID are automatically migrated to `tall` via `FRAME_ALIASES`.

### Storage

Assets are persisted in **IndexedDB** (`imagebox_assets` database) on the client. No server-side storage is required. Thumbnails are generated lazily from editor element data and cached as base64 data URLs in IndexedDB alongside each asset.

---

## UI State Machine

The interface uses a 5-state system controlled by `body.state-{name}` classes and `panel.className`:

### States

**Closed** — Default. Full canvas view. Hamburger menu (top-left), Edit button (bottom-right), prompt bar (bottom-center). Panel is hidden.

**Browse** — Gallery panel open. Shows Cancel + "Browse" title + search icon in header. Category dropdown, scrollable asset list with thumbnails. Arrow up/down keyboard navigation steps through items with live canvas preview.

**Search** — Search mode. Shows "Search" title + close button in header. Search input focused, dimmed canvas overlay. Category dropdown hidden. Filters assets by name and tags.

**Editing** — Editor panel open. Shows Cancel + "Edit" title + Done button in header. Four tabs: File (name/description/tags), Frame (preset/background/anchor), Shapes (primitive palette), Colours (role assignments + palettes). Hamburger shows dropdown menu.

**Properties** — Shape properties overlay. Shows Back button + "Properties" title in header. Appears when clicking a shape on the canvas during edit mode. Shows shape type, layer controls, parameter sliders/inputs, position fields, and delete button. Clicking canvas background or Back returns to editing.

### Transitions

```
Closed ──hamburger──→ Browse
Closed ──Edit btn───→ Editing
Browse ──Cancel─────→ Closed
Browse ──🔍──────────→ Search
Browse ──asset card──→ loads asset (stays in Browse)
Search ──✕───────────→ Browse
Editing ──click shape─→ Properties
Editing ──Cancel──────→ Closed (restores pre-edit snapshot)
Editing ──Done────────→ Closed (saves to IndexedDB)
Properties ──Back─────→ Editing
Properties ──canvas bg→ Editing
```

---

## AI Integration

The prompt bar connects to the **Anthropic Messages API** using `claude-opus-4-6`. It operates in two modes:

### Modify Mode (default)
When an asset is loaded, the prompt sends the full current asset state (elements, colours, frame, metadata) as context. The AI modifies the existing asset based on the user's description. The user never starts from a blank canvas.

### Create Mode (via "+ New")
Pressing "+ New" switches to create mode — the prompt generates an entirely new asset from scratch. The button changes to "✕" to cancel back to modify mode. Once the new asset is generated, it loads and the prompt returns to modify mode.

The system prompt template is loaded from `assets/system-prompt.md` at runtime and includes the full primitives schema, DB32 palette, colour role rules, and frame options.

---

## Batch Assets

The `assets/emojis/` folder contains 162+ pre-built assets across 8 categories (animals, food, flags, symbols, etc.), imported via batch JSON files. A `manifest.json` maps category IDs to display names.

These assets have `svg: null` in their payload — the SVG is never pre-rendered. Instead, `_editor.elements` stores the primitive data, and thumbnails are generated lazily by `buildSVGFromAsset()` + `ensureThumbnails()` at gallery render time.

---

## Design Philosophy

ImageBox is designed as a **repeatable pattern** for any builder or simulation assembler tool in the Simbox ecosystem. The 5-state UI machine (closed → browse → search → editing → properties), context-sensitive prompting (modify existing vs. create new), and JSON-native asset format are all intended to be reusable across future tools like the character builder, environment editor, and scene assembler.

---

## Known TODOs

- [ ] Improve primitive/shape tooling and add style guidance for AI
- [ ] Re-batch refined looks across asset categories
- [ ] Expand to patterns, walls, and symbols categories
- [ ] Attach points editor (for character assembly)
- [ ] Pattern/tile fill support
- [ ] 3D primitive library (future — separate builder)
- [ ] Mobile touch interactions (long-press select, gesture support)

---

## Running Locally

Requires a local HTTP server (ES module imports won't work over `file://`).

**Option 1 — Double-click launcher (macOS):**
Double-click `start-server.command` in Finder. It opens Terminal, navigates to this folder, and runs `npx serve . -p 5500`.

**Option 2 — Manual:**
```bash
cd /path/to/ImageBox-V2
npx serve . -p 5500
```

Then open `http://localhost:5500` in your browser.

---

## Asset Schema

Saved assets follow the universal Simbox envelope:

```json
{
  "id": "asset_happy_face_1234567890",
  "type": "asset",
  "name": "Happy Face",
  "tags": ["face", "starter"],
  "meta": {
    "created": "ISO-8601",
    "modified": "ISO-8601",
    "origin": "user",
    "creator": "local-user",
    "version": 1,
    "thumbnail": "data:image/png;base64,..."
  },
  "payload": {
    "description": "...",
    "format": "svg",
    "viewBox": "56 56 400 400",
    "svg": "<svg>...</svg>",
    "color_roles_used": ["primary", "secondary", "tertiary"],
    "color_assignments": { "primary": "#5b6ee1", "secondary": "#df7126", "tertiary": "#222034" },
    "background_color": "#2e222f",
    "palette_id": "db32",
    "anchor_point": { "x": 256, "y": 256 },
    "natural_size": { "w": 400, "h": 400 },
    "frame_preset": "square",
    "attach_points": {},
    "layer": null,
    "z_index": 0,
    "_editor": {
      "elements": [
        { "id": "el_abc123", "primitiveId": "circle", "zIndex": 0, "params": { "cx": 256, "cy": 256, "r": 200, "fill": "primary", "stroke": "secondary", "strokeWidth": 8 } }
      ],
      "color_assignments": { "primary": "#5b6ee1", "secondary": "#df7126", "tertiary": "#222034" }
    }
  }
}
```

The `_editor` block stores the primitive element list so assets can be round-tripped back into the editor. The `viewBox` reflects the frame preset (offset + dimensions within the 512×512 canvas).
