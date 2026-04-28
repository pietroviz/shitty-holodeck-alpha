# Shitty Holodeck (Alpha) — Project Guide

> **Purpose of this file:** This is the single source of truth for any AI session or collaborator working on this project. Read this before writing any code.

---

## What This Is

A Next.js web app hosted on Vercel at **shittyholodeck.com**. It's a skeleton/platform for interactive experiences, backed by Supabase for auth, data, and user management. The project is in early alpha — the structure is in place but the actual "experiences" (the core content) are still placeholders.

**Owner:** Pietro Gagliano (@pietroviz on GitHub)
**Repo:** `github.com/pietroviz/shitty-holodeck-alpha` (private)
**Hosting:** Vercel (auto-deploys on push to `main`)
**Database:** Supabase (project ref: `jtdcdzguzbfhqbpsptvt`)

---

## Tech Stack

| Layer        | Technology                                    |
|-------------|-----------------------------------------------|
| Framework   | Next.js 16.2.3 (App Router)                  |
| React       | 19.2.4                                        |
| Styling     | Tailwind CSS 4                                |
| Auth        | Supabase Auth (magic links, PKCE flow)        |
| Database    | Supabase (Postgres + RLS)                     |
| Auth SSR    | `@supabase/ssr` 0.10.2                        |
| Hosting     | Vercel                                        |
| Domain      | shittyholodeck.com                            |

**Important:** This uses Next.js 16.2.3 which has breaking changes from earlier versions. Before writing code, check `AGENTS.md` and read the relevant guide in `node_modules/next/dist/docs/` for up-to-date API conventions.

---

## Environment Variables

Stored in `.env.local` (not committed — see `.env.local.example` for the template):

```
NEXT_PUBLIC_SUPABASE_URL=https://jtdcdzguzbfhqbpsptvt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SITE_PASSWORD=ohio
```

These same values are set in **Vercel → Settings → Environment Variables** for production.

---

## Auth & Access Flow

The site has a **two-layer access system**:

### Layer 1: Password Gate
- Every visitor hits the gate first (`/gate`)
- They enter a shared password (`ohio`) — this is a simple private beta gate, not per-user auth
- On success, an `httpOnly` cookie (`site_access=granted`) is set with a 30-day expiry
- The middleware (`middleware.ts`) checks this cookie on every request and redirects to `/gate` if missing
- Once past the gate, users don't see it again until the cookie expires or is cleared

### Layer 2: User Auth (Optional)
After passing the gate, users choose:

1. **Continue as Guest** → goes to `/guest` with a client-side `guest_id` cookie (7-day expiry). Guest data can later be linked to a real account.
2. **Sign in with Email** → goes to `/auth/login`, enters email, receives a **magic link** (not an OTP code). Clicking the link in the email hits `/auth/callback`, exchanges the code for a Supabase session, and:
   - **New user** (no username set) → redirected to `/auth/setup` to enter full name + username
   - **Returning user** → redirected straight to `/dashboard`

### Session Persistence
- Supabase sessions are cookie-based via `@supabase/ssr`
- The middleware runs `updateSession()` on every request to keep tokens fresh
- Users stay logged in across browser sessions until the Supabase refresh token expires

### Sign Out
- POST to `/api/auth/signout` clears the Supabase session
- The `site_access` cookie is preserved so users don't re-hit the gate
- Redirects to `/` (home page)

---

## Middleware Logic (middleware.ts)

The root middleware handles both the gate and Supabase session refresh:

1. **Always allowed through without gate check:** `/gate`, `/api/gate`, `/auth/*`, `/api/auth/*`, `/_next/*`, `/favicon*`
2. Auth routes (`/auth/*`, `/api/auth/*`) still get `updateSession()` for cookie refresh
3. All other routes: check for `site_access` cookie → redirect to `/gate` if missing → run `updateSession()`

---

## File Structure

```
├── middleware.ts                  # Gate + Supabase session middleware
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home page (auth-aware)
│   │   ├── layout.tsx            # Root layout (metadata, FeedbackTab)
│   │   ├── gate/page.tsx         # Password gate → choice screen
│   │   ├── guest/page.tsx        # Guest mode landing
│   │   ├── dashboard/page.tsx    # Authenticated user dashboard
│   │   ├── auth/
│   │   │   ├── login/page.tsx    # Email input → magic link sent
│   │   │   ├── setup/page.tsx    # New user account setup (name + username)
│   │   │   └── callback/route.ts # Magic link callback handler
│   │   ├── api/
│   │   │   ├── gate/route.ts     # Password validation endpoint
│   │   │   ├── auth/signout/route.ts  # Sign out endpoint
│   │   │   ├── feedback/route.ts      # Feedback submission endpoint
│   │   │   └── guest/link/route.ts    # Guest-to-user data linking
│   │   └── simulators/
│   │       └── example/page.tsx  # Placeholder experience page
│   ├── components/
│   │   └── FeedbackTab.tsx       # Floating feedback button (logged-in users only)
│   └── lib/
│       └── supabase/
│           ├── client.ts         # Browser Supabase client
│           ├── server.ts         # Server Supabase client
│           ├── middleware.ts      # updateSession() for cookie refresh
│           └── types.ts          # TypeScript types for DB tables
├── supabase/
│   └── migrations/               # SQL migrations (already applied)
│       ├── 00001_initial_schema.sql
│       ├── 00002_guest_sessions.sql
│       ├── 00003_feedback.sql
│       └── 00004_profile_username.sql
├── .env.local                    # Secrets (not committed)
├── AGENTS.md                     # Next.js version warning
├── CLAUDE.md                     # Points to AGENTS.md
└── PROJECT_GUIDE.md              # This file
```

---

## Database Schema (Supabase / Postgres)

All tables have RLS (Row Level Security) enabled.

### profiles
Extends `auth.users` — auto-created by a trigger when a user signs up.

| Column       | Type        | Notes                                    |
|-------------|-------------|------------------------------------------|
| id          | uuid (PK)   | References auth.users                    |
| email       | text        | From auth signup                         |
| display_name| text        | Optional display name                    |
| full_name   | text        | Set during account setup                 |
| username    | text (unique)| Set during account setup, publicly visible|
| created_at  | timestamptz | Auto                                     |
| updated_at  | timestamptz | Auto                                     |

### simulators
Tracks experiences/simulators. Currently empty — placeholder for future content.

| Column       | Type        | Notes                                    |
|-------------|-------------|------------------------------------------|
| id          | uuid (PK)   | Auto-generated                           |
| owner_id    | uuid (FK)   | References profiles                      |
| title       | text        |                                          |
| description | text        |                                          |
| slug        | text (unique)|                                         |
| status      | text        | 'draft', 'live', or 'archived'           |
| config      | jsonb       | Flexible config storage                  |
| created_at  | timestamptz |                                          |
| updated_at  | timestamptz |                                          |

### simulation_runs
Stores run data for both authenticated users and guests.

| Column        | Type        | Notes                                  |
|--------------|-------------|----------------------------------------|
| id           | uuid (PK)   |                                        |
| simulator_id | uuid (FK)   | References simulators                  |
| user_id      | uuid (FK)   | References profiles (null for guests)  |
| guest_id     | text        | Client-side guest ID (null for users)  |
| input_data   | jsonb       |                                        |
| output_data  | jsonb       |                                        |
| created_at   | timestamptz |                                        |

### feedback
In-app feedback/notes from logged-in users.

| Column     | Type        | Notes                                    |
|-----------|-------------|------------------------------------------|
| id        | uuid (PK)   |                                          |
| user_id   | uuid (FK)   | References profiles                      |
| page_url  | text        | Page the feedback was submitted from     |
| message   | text        | Max 2000 chars (enforced client-side)    |
| created_at| timestamptz |                                          |

---

## Feedback System

There's a floating "Feedback" tab on the right edge of every page (only visible to logged-in users). It submits notes to the `feedback` table via `POST /api/feedback`.

### For future sessions:
**Before starting work, ask Pietro if he'd like you to review and prioritize any feedback entries from the database.** Don't automatically pull and act on feedback — the session's task might be something else entirely. But if Pietro says yes, you can query the feedback table via the Supabase client to see what's been submitted.

To query feedback (server-side):
```typescript
const { data } = await supabase
  .from('feedback')
  .select('*')
  .order('created_at', { ascending: false });
```

---

## Supabase Email Templates

The magic link and confirmation emails are configured in Supabase. They should say "Shitty Holodeck (Alpha)" (not "Pietro's Simulator Lab"). The magic link template uses `{{ .ConfirmationURL }}` to generate a clickable link — do NOT change this to `{{ .Token }}` or users will get OTP codes instead of magic links.

**Note:** As of the last session, the email templates may still say "Pietro's Simulator Lab" and need to be updated via the Supabase dashboard (Authentication → Email Templates) or via the Management API.

---

## Deployment

- **Vercel** auto-deploys when code is pushed to `main` on GitHub
- The custom domain `shittyholodeck.com` is configured in Vercel
- Environment variables are set in both `.env.local` (local dev) and Vercel dashboard (production)
- To push from terminal: `git push origin main` (requires GitHub auth)

**Branch note:** The local repo may be on the `master` branch while Vercel deploys from `main`. If you're on `master` locally, use `git push origin master:main` to push to the production branch. Pushing to `master` alone only creates a Vercel preview deployment — it won't update the live site at shittyholodeck.com.

---

## Naming Conventions

The project uses "experiences" (not "simulators") in all user-facing text, though some internal identifiers (table names, route paths like `/simulators/example`) still use the old "simulator" naming. The user-facing brand is **"Shitty Holodeck (Alpha)"**.

---

## Adding New Experiences (Merging New Content)

This skeleton is designed to have new experiences slotted in. Here's where things go:

### Page routes
New experience pages go in `src/app/simulators/` (or preferably `src/app/experiences/` for new routes). Each experience gets its own folder with a `page.tsx`:
```
src/app/experiences/
  ├── my-cool-thing/
  │   └── page.tsx        # The experience's main page
  ├── another-one/
  │   └── page.tsx
  └── ...
```
The existing `/simulators/example/page.tsx` is a working template showing the basic structure.

### Components
Shared or reusable components go in `src/components/`. Experience-specific components can live in the experience's own folder:
```
src/app/experiences/my-cool-thing/
  ├── page.tsx
  ├── SomeWidget.tsx      # Component specific to this experience
  └── utils.ts            # Helpers specific to this experience
```

### Styles
The project uses Tailwind CSS 4 — styles are applied via utility classes in JSX. Global styles live in `src/app/globals.css` but should rarely need changes.

### Database
If an experience needs to store data, use the existing `simulators` table (add a row with a slug matching the route) and `simulation_runs` table (stores per-run input/output as flexible JSONB). The `config` column on `simulators` is a JSONB catch-all for experience-specific settings.

### API routes
If an experience needs a server-side endpoint, add it under `src/app/api/`. Follow the existing patterns in `api/feedback/route.ts` or `api/gate/route.ts`.

### What NOT to touch during a merge
These files form the auth/infrastructure layer and should not be overwritten:
- `middleware.ts` — gate + session refresh logic
- `src/lib/supabase/*` — Supabase client setup
- `src/app/gate/page.tsx` — password gate
- `src/app/auth/*` — login, setup, callback flows
- `src/app/api/gate/route.ts` — gate API
- `src/app/api/auth/*` — auth API routes
- `src/components/FeedbackTab.tsx` — feedback widget
- `.env.local` — secrets (should already exist on each machine)
- `CLAUDE.md`, `AGENTS.md`, `PROJECT_GUIDE.md` — session context files

### Environment setup on a new machine
1. Clone the repo: `git clone https://github.com/pietroviz/shitty-holodeck-alpha.git`
2. Install dependencies: `npm install`
3. Create `.env.local` from `.env.local.example` and fill in the Supabase keys
4. Run locally: `npm run dev`
5. Push to deploy: `git push origin main` (Vercel auto-deploys)

---

## Known Issues & Gotchas

1. **Supabase dashboard renders black** in browser automation sessions. Workaround: use the Management API (`api.supabase.com/v1/projects/...`) or execute JavaScript in the dashboard page context.
2. **The `simulators` table and route paths** still use the old naming. The DB table doesn't need renaming (it's internal), but if new routes are created, prefer `/experiences/` over `/simulators/`.
3. **There's a `Simulator` type in `types.ts`** — keep it for now since it matches the DB table name, but new types should use the updated naming.
4. **Cookie clearing quirks:** The `site_access` cookie is `httpOnly`, so browser extensions and some "clear cookies" options don't remove it. Users need to do a full site data clear or use incognito to reset the gate.
5. **Thumbnail system (resolved)** — The offscreen Three.js `thumbnailGenerator.js` had two bugs: (1) referenced `CHARACTER.neckGap` which doesn't exist (should be `HEAD.neckGap`), causing NaN camera positions; (2) dual WebGL contexts on the same page caused the second renderer's mesh draw calls to silently fail. Fixed by switching to pre-rendered static thumbnails generated via a Python script (`scripts/generate-thumbnails.py`). The in-browser `thumbnailGenerator.js` is kept only for user-created assets (one at a time). See "Thumbnail Generation" section below for the process.
6. **Guest feedback silently dropped** — The RLS policy on the `feedback` table requires `auth.uid() = user_id` for inserts. Guests (no auth) submit with `user_id: null`, which fails RLS, but the API returns `{ success: true }` anyway (line 45-46 of `api/feedback/route.ts`). To fix: add an RLS policy `CREATE POLICY "Allow guest feedback inserts" ON public.feedback FOR INSERT WITH CHECK (user_id IS NULL);` via the Supabase SQL Editor. Pietro decided not to do this yet.

---

## Thumbnail Generation

Browse panel thumbnails are **pre-rendered static images** for stock assets and **generated in-browser** for user-created assets.

### Stock asset thumbnails (pre-rendered)

A Python script reads the asset JSON files and draws simplified 2D thumbnails using each asset's actual colors. The output goes to `public/holodeck/thumbnails/{asset_id}.jpg`.

**When to run:** After adding, removing, or updating stock assets in `global_assets/`.

**How to run:**
```bash
# All asset types
python3 scripts/generate-thumbnails.py

# Just one type
python3 scripts/generate-thumbnails.py characters
python3 scripts/generate-thumbnails.py objects
python3 scripts/generate-thumbnails.py environments
```

**Requirements:** Python 3 + Pillow (`pip install Pillow`)

**What it does:** For each asset JSON in the manifest, draws a simplified representation:
- **Characters:** Colored body (torso + bottom zone), head (skin + scalp), eyes with iris color
- **Props/Objects:** Colored shape blocks based on the object's elements
- **Environments:** Sky + ground color split
- **Voice/Music:** Colored circle placeholder

After running, commit the new thumbnails and push — they deploy as static files with the site.

**Important notes:**
- You need Pillow installed (`pip install Pillow` or `pip3 install Pillow`). It's not in the Node dependencies — it's a one-time Python setup.
- The thumbnails are simplified 2D drawings, not screenshots of the 3D models. They use each asset's actual colors but the shapes are simplified (e.g., characters are a rectangle body + ellipse head, not the full rounded 3D mesh). They won't match the 3D preview exactly, but they're good enough for browse panel identification.
- Make sure to push to `main` (not just `master`) so thumbnails appear on the live site. See the Deployment section above.

### User-created asset thumbnails (in-browser)

When a user creates or edits an asset, the in-browser `thumbnailGenerator.js` renders a single thumbnail using the main viewport's preview renderer (via the `onThumbnail` callback in `previewRenderer.js`). This avoids the dual-WebGL-context issue since it reuses the existing renderer. The thumbnail is cached in IndexedDB for the user's browser.

### File structure
```
scripts/
  generate-thumbnails.py       # Stock thumbnail generator
public/holodeck/
  thumbnails/                  # Pre-rendered stock thumbnails (committed)
    char_asterion.jpg
    char_blobsworth.jpg
    ...
  js/
    thumbnailGenerator.js      # In-browser generator (user assets only)
    app.js                     # Loads static thumbs for stock, browser gen for user
```

---

## Recent Changes (April 13, 2026 sessions — Claude Code terminal + Cowork)

Changes made across two sessions. The first session (Claude Code terminal) addressed feedback from the in-app Feedback tab. The second session (Cowork) resolved the thumbnail system and deployed it live.

### Bugs Fixed
- **Search typing backwards** (`app.js`) — Panel search input triggered a full `render()` on every keystroke, which rebuilt the HTML and reset the cursor to position 0. Fixed by adding `renderPanelItems()` that only re-renders the item list, leaving the search input untouched.
- **3D asset orientation** (`previewRenderer.js`) — Torus (ring) geometry rotated 90° upright (`rotateX(Math.PI/2)`), cone geometry flipped (`rotateX(Math.PI)`) to fix wrong tilt direction.

### UI/Visual Improvements
- **Mid-grey text lightened** (`styles.css`) — `--text-dim` and `--text-secondary` changed from `#5A6676` → `#8494A7` for better readability.
- **Pink reference frame opacity** (`styles.css`) — Safe-area border reduced from 15% → 10% opacity.
- **Loading spinner** (`styles.css`, `app.js`) — Added animated spinner (`.panel-spinner`) to browse panel loading state.
- **2D image auto-rotate disabled** (`previewRenderer.js`) — Images now default to no rotation, matching voice behavior.
- **3D auto-rotate ping-pong** (`previewRenderer.js`) — Replaced continuous 360° rotation with smooth oscillation between 3/4 left and 3/4 right views. Uses manual azimuth control instead of OrbitControls autoRotate.

### Character Builder
- **Body proportions shifted** (`shared/charConfig.js`) — `bottomHeight` increased from 0.13 → 0.156 (20% taller), `skinHeight` reduced from 0.62 → 0.594 to compensate. Overall character height unchanged.
- **Gear color selectors** (`bridges/CharacterBridge.js`) — Added color swatch pickers for Hair, Hat, Glasses, and Facial Hair in the Gear tab. Color swatches only appear when the corresponding accessory is not "none". Gear colors update live by traversing the accessory mesh group.

### Thumbnail System (resolved)
- **Placeholder icons** (`app.js`) — Added `_thumbHTML()` helper with emoji-based type placeholders (👤 character, 🌄 environment, etc.) as fallbacks when a thumbnail can't load.
- **Pre-rendered static thumbnails** (`scripts/generate-thumbnails.py` — NEW FILE) — Python/Pillow script that generates 128x128 JPEG thumbnails from asset JSON files. Run this after updating stock assets. See the "Thumbnail Generation" section above for details.
- **Stock vs. user logic** (`app.js`) — `_thumbHTML()` now serves static thumbnails (`thumbnails/{id}.jpg`) for stock assets, and only uses the in-browser generator for user-created assets. The batch generator in `_openBrowsePanel()` is filtered to `meta.owner === 'user'` only.
- **In-browser generator fixed** (`thumbnailGenerator.js`) — Fixed `CHARACTER.neckGap` → `HEAD.neckGap` bug and switched to `MeshBasicMaterial` (no lights needed). Kept for single user-asset thumbnail generation only — the dual-WebGL-context issue makes batch generation unreliable.

### Feedback from the Feedback Tab (for reference)
The following items from the feedback table were NOT addressed in this session and remain open:
- Add optional eyelashes to eye shapes
- Use 2D assets for facial hair + add eyebrow options/thicknesses
- Add thumbnails to bottom nav next to item titles
- Assign voices from standard voice set to stock characters
- Add character catchphrases/taglines to character files and preview
- Browse menu load time optimization (spinner added, but underlying speed not addressed)

---

## Recent Changes (April 22, 2026 session — Cowork)

Extended the 25-environment batch with stage props + ground-object dressing, renamed the cast/prop model to prepare for an upcoming camera + script system, and brought the browse-panel preview up to parity with the edit view.

### Stage Props + Ground Dressing
- **25 envs dressed** (`scripts/generate-env-batch-1.js`) — Each environment now ships with stage props and ground-object scatter/tile slots populated, not just colors + sky. Regenerates all 25 JSON files under `public/holodeck/global_assets/environments/`.
- **Ground-object + prop builds** (`bridges/EnvironmentBridge.js`) — Scatter/tile point generators for both the ground plane (avoids stage + camera corridor) and the stage area (avoids occupied cast cells). Height-capping prevents oversized meshes from blocking the view.

### Cast + Prop Rename (camera/script prep)
- **Cast dropped from 5 → 3 slots** — Scripts (coming) only support 3 characters. Slot A is the main character by convention; camera/framing logic will default to `CHAR_A`. See [env_script_naming.md](.claude/projects/-Users-skipper-Documents-Vibes-ShittyHolodeck-V0-9/memory/env_script_naming.md) for the full convention.
- **"Stage items" → "props"** (`bridges/EnvironmentBridge.js`, `scripts/generate-env-batch-1.js`, all 25 env JSON files) — Field renamed throughout state, bridge, and generator. Legacy `stageItems` field is still accepted on load so pre-existing envs don't break. UI labels updated: cards now render `CHAR_A/B/C` and `PROP_A..E` badges.
- **CSS fix** (`css/styles.css`) — `.cb-gobj-card-num` widened to `46px` to fit the new `PROP_A` label (was sized for single digits).

### Browse Preview Parity
- **Full env rendering in browse panel** (`js/previewRenderer.js`) — Previously the browse preview only rendered sky + ground + walls + sun. It now also loads and places stage props, ground objects (scatter/tile with height-capping), and weather particles — matching what the edit view shows.
- **Camera culling ported** — Wall sub-groups are tagged (back/front/left/right) so the preview can dynamically hide the walls between the camera and the stage. Ground objects taller than `0.8` get hidden when they're inside the ±40° camera corridor. Runs every frame from the preview's tick loop.
- **Weather particles ported** — Snow, rain, and leaves particle systems (500 particles each) with per-particle velocity + drift, respawn logic, and leaf-palette colour variation. Tick-advanced from the same loop.

### Naming + Placement Conventions (for the upcoming script system)

These conventions are now baked into the env state and the bridge/preview. Keep using them when touching cast/prop code:

- **CHAR_A, CHAR_B, CHAR_C** — 3 cast slots. `CHAR_A` is the top slot and generally the main character.
- **PROP_A through PROP_E** — 5 prop slots on the stage. Each slot has `{ assetId, mode: 'place'|'scatter'|'tile', cell, density, scale }`.
- **BINGO grid** — Spatial placement for cast + placed props. Columns `B/I/N/G/O` (left→right), rows `5/4/3/2/1` (front→back). Cell string e.g. `N3` is centre. `_cellToWorld(cell)` → `{x: col-2, z: row-3}` in EnvironmentBridge (and the mirror `_envCellToWorld` in previewRenderer).
- **Field names on env state**: `cast[]`, `props[]`, `groundObjects[]`, `weather`, `walls`, `windowStyle`. Legacy `stageItems` is read-only backwards compat.

### Story Captions + Floating Name Tags (April 23 follow-up)

- **New shared UI layer** (`public/holodeck/js/shared/archetypeHead.js`) — A single-line word-by-word caption (`#story-subtitle`) and a per-slot floating name tag layer (`#story-name-tags`) that hovers above whichever character is currently speaking. Both are driven by the VisemeEngine's `wordIdx` and positioned to track the Play button / head container.
- **Chunky pixel font** — Jersey 25 loaded once from Google Fonts, applied to both the caption and the tags (fallback `Silkscreen` → `Press Start 2P` → `Courier New` → monospace). Narrow enough that long captions don't run out of horizontal room, but still reads as retro/blocky so it matches the pixel tone of the app.
- **Positions tuned for the existing layout** — Caption centred vertically on the 72px Play button (`bottom:210px`). Name tag lifts `0.46` world units above each head container (~0.17 clearance above the head top given a medium-preset 0.58 head height).
- **Public API + reuse pattern documented** in the new "Captions + Floating Name Tags" section below. This is the pattern the simulation-builder (and any future trailer/tutorial playback) should import directly rather than re-implementing.

### Batch-3 Environments + Thumbnail Farm (same session, later in day)
- **40 new envs** (`scripts/generate-env-batch-3.js`) — Pushing toward the 200-env goal. Spread across all 9 active categories with a bias toward variety and bizarre comedy (Goblin Market, Fairy Dentist's Office, Cryo-DMV, Jelly Planet Surface, Haunted Karaoke Bar, Liminal Hotel Hallway, Dragon HR Department, Ball Pit Lounge, Therapy Goat Pen, Middle-Management Purgatory, and 30 more). Total stock env count is now **89** (48 batch-1/2 + 40 batch-3 + 1 blank `env_default`).
- **3D thumbnail farm** (`public/holodeck/env-thumb-farm.html` + `src/app/api/admin/save-env-thumb/route.ts`) — Dev-only page that iterates every stock env, renders each via the existing `previewRenderer` pipeline, captures a 512×512 JPEG from the canvas, and POSTs it to an API route that writes the file into `public/holodeck/thumbnails/`. Replaces the old flat Python/Pillow thumbnails with real 3D captures that include stage props, ground dressing, and weather. Run it locally at `http://localhost:3000/holodeck/env-thumb-farm.html`, then commit the refreshed thumbnails. The API route returns 403 in production so there's no public write endpoint.

---

## Integrating Environments + Characters + Music into a "Simulation"

This is guidance for the **upcoming simulation-builder work**. Nothing below is built yet — it captures the design intent so a future session can pick it up cleanly.

### The building blocks (what already exists)

| Asset type    | What it owns                                                      | Where it lives                                      |
|--------------|--------------------------------------------------------------------|-----------------------------------------------------|
| Environment  | Sky, ground, stage, walls, lighting, fog, props, ground dressing, weather, assigned music | `global_assets/environments/{category}/env_*.json` |
| Character    | Body, head, skin/scalp colours, gear (hair/hat/glasses/facial hair), optionally a voice | `global_assets/characters/char_*.json`             |
| Music        | BPM, layers (pattern strings), mood colour                        | `global_assets/music/music_*.json`                 |
| Voice        | Voice profile + visemes (used by `voiceEngine.js` → mouth rig)    | `global_assets/voices/voice_*.json`                |

A "simulation" binds these together: pick an environment, assign up to 3 characters into its cast slots, let the env's music auto-play, and (eventually) run a script that drives speech + camera.

### Data shape for a simulation (proposal)

Keep it flat and JSON-serializable so it can live in the `simulators.config` JSONB column or a new `simulations` table. Rough shape:

```json
{
  "id": "sim_...",
  "envId": "env_dragon_lair",
  "cast": [
    { "slot": "CHAR_A", "charId": "char_asterion", "cell": "N3" },
    { "slot": "CHAR_B", "charId": "char_blobsworth", "cell": "I2" },
    { "slot": "CHAR_C", "charId": "char_nyra", "cell": "G4" }
  ],
  "musicId": "music_...",    // optional override; env supplies a default
  "script": [ /* coming — turn/line format TBD */ ]
}
```

The env already carries the scene (props, ground, walls, weather, lighting, sun). The simulation layer just overlays cast + script on top.

### Order of operations at runtime (how to compose)

When loading a simulation, **build the env first**, then overlay cast, then start music/script:

1. **Env:** reuse `EnvironmentBridge` (edit view) or the new preview pipeline. Either way, the env sets the scene — ground, stage, walls, props, ground dressing, weather, lighting.
2. **Cast:** for each `cast[]` entry, build the character mesh (see `CharacterBridge.js` for the asset→mesh logic) and place it at `cellToWorld(cell)`. `CHAR_A` usually centre-stage or slightly forward — let camera framing key off slot A.
3. **Music:** if `musicId` is set, `previewPlayMusic(musicId)`. Otherwise fall back to the env's `state.musicId`.
4. **Script (coming):** a turn-based format referencing `<CHAR_A>`, `<PROP_B>`, etc. by slot name — not by asset id. That way a script can be re-cast with different characters without a rewrite.

### Things to be careful about

- **Don't re-invent placement helpers.** `_cellToWorld` / BINGO logic already lives in `EnvironmentBridge` and `previewRenderer`. Share one source of truth — pull it into a `shared/envGeometry.js` or similar when the simulation builder lands, so it isn't forked a third time.
- **Camera corridor.** The default camera is at `(5.2, 3.9, 5.2)`. Walls and tall ground objects inside the ±40° wedge from origin→camera get dynamically hidden. Any cast placement logic should assume this corridor exists — don't put `CHAR_A` at a cell that falls inside it (roughly `G4`, `G5`, `O4`, `O5`).
- **Props avoid cast cells.** Scatter/tile prop modes skip cells occupied by cast. When placing cast for a simulation, rebuild props after the cast is set so the avoidance runs.
- **Voices are per-character.** Stock characters don't have voices assigned yet (that's in the open-feedback list). The simulation layer should gracefully handle a character with no voice — silent mouth, or fall back to a default voice.
- **Music is per-env by default.** Each env ships with a `musicId`. The simulation can override, but the common case is "let the env's music play." Don't require the simulation to specify music explicitly.

### Open questions for the next session

- **Script format.** Turn-based line-per-character? Timeline with timestamps? Branching? Not decided yet — ask Pietro first.
- **Camera moves.** Does the script drive the camera (cut to `CHAR_A`, wide on stage) or is the camera static? Likely per-line camera directives keyed off slot names.
- **Simulation storage.** New `simulations` table vs. reusing `simulators.config` JSONB? The schema in PROJECT_GUIDE.md already has `simulators` + `simulation_runs`.
- **Play control.** Browse preview auto-plays music and loops weather. A real simulation probably wants pause/resume, scrub, restart — that's UI work on top.

### Key files to read before building the simulation layer

- `public/holodeck/js/bridges/EnvironmentBridge.js` — env rendering, BINGO placement, camera culling, prop/ground logic.
- `public/holodeck/js/bridges/CharacterBridge.js` — character asset → mesh.
- `public/holodeck/js/previewRenderer.js` — headless/browse rendering path (now matches bridge for envs).
- `public/holodeck/js/voiceEngine.js` + `mouthRig.js` — lip-sync + viseme → mesh.
- `public/holodeck/js/musicEngine.js` — layer/pattern playback.
- `.claude/projects/-Users-skipper-Documents-Vibes-ShittyHolodeck-V0-9/memory/env_script_naming.md` — canonical naming convention.

---

## Captions + Floating Name Tags (Story Playback)

Story playback has a small UI layer that sits *on top* of the 3D renderer: a single-line caption showing the currently-spoken word, and a floating label that hovers above whichever character is speaking. It's designed so the **simulation-builder** (and anything else that renders talking heads — trailers, tutorials, previews) can reuse the same pattern without reinventing it.

All of it lives in one module: `public/holodeck/js/shared/archetypeHead.js`.

### What exists

- **One DOM subtitle element** (`#story-subtitle`) — a single-line caption that swaps its text word-by-word while the VisemeEngine speaks. Anchored inside `#ui-elements` so it rides the same positioning context as the Play button and stays responsive to layout changes.
- **One DOM layer with per-character tags** (`#story-name-tags` → one `#name-tag-<slot>` child per head) — each tag is world-space projected to pixel coords every frame, and only the currently-speaking head's tag is visible.
- **Shared chunky pixel font** — Silkscreen loaded once on demand from Google Fonts, applied to both the caption and the tags so the whole story UI reads as one coherent pixel-display style.

### Public API (import from `shared/archetypeHead.js`)

```js
import {
    showSubtitle, setSubtitleWord, hideSubtitle, removeSubtitle,
    updateStoryNameTags, removeStoryNameTags,
} from './shared/archetypeHead.js?v=4';
```

| Function | When to call | Notes |
|----------|-------------|-------|
| `showSubtitle(text)` | Start of a spoken line | Tokenises on whitespace the same way `VisemeEngine` does, shows word `[0]`, and fades in. Pass `''` or falsy to hide. |
| `setSubtitleWord(idx)` | Every frame while speaking | Pass `visemeEngine.getParams().wordIdx`. Word index is clamped into range; a no-op if it hasn't changed. |
| `hideSubtitle()` | End of a line | Fades out; keeps the element mounted. |
| `removeSubtitle()` | Playback teardown | Removes the element entirely. |
| `updateStoryNameTags(heads, speakingSlot, camera, rendererEl)` | Every frame | Projects each head's container world position → NDC → pixel-space. Only the `speakingSlot` tag is visible. `heads` is `[{ slot, container, label }]`. |
| `removeStoryNameTags()` | Playback teardown | Removes the whole layer + children. |

### Wiring pattern (how StoryBridge + previewRenderer do it today)

```js
// When starting a line:
showSubtitle(line.text);
speakingSlot = line.slot;

// Every tick:
const v = visemeEngine.getParams();
setSubtitleWord(v.wordIdx);
updateStoryNameTags(this._heads, this._speakingSlot, this._camera, this._renderer.domElement);

// When the line ends:
hideSubtitle();
speakingSlot = null;

// On teardown:
removeSubtitle();
removeStoryNameTags();
```

Heads handed to `updateStoryNameTags` need a consistent shape. StoryBridge and previewRenderer both build them like this:

```js
this._heads.push({
    slot: cast.slot,                    // 'CHAR_A' etc.
    container: headGroup,               // THREE.Object3D — its world Y centre is the head visual centre
    label: `${cast.archetype}-core`,    // what the floating tag reads
    // ...talk(), mouthRig, etc. for the head itself
});
```

### Styling (don't re-derive these numbers in new callers)

Both elements are styled inline at creation time — no external CSS file — so the style is the source of truth.

- **Font:** Jersey 25, loaded from `https://fonts.googleapis.com/css2?family=Jersey+25&display=swap`. Fallback: `'Silkscreen', 'Press Start 2P', 'Courier New', monospace`. The loader is idempotent (checks for `#story-pixel-font-link` before appending).
- **Subtitle:** `15px`, `letter-spacing:0.02em`, `line-height:1.35`, `padding:10px 20px`, `max-width:min(80%, 720px)`. Dark translucent pill (`rgba(14,18,28,0.72)`) with blur backdrop. Anchored at `bottom:210px; left:50%; transform:translate(-50%, 50%)` so its vertical centre lines up with the 72px Play button's centre (Play button sits at `bottom:174px`, so centre = `174 + 36 = 210`). Lives inside `#ui-elements`.
- **Name tag:** `10px`, `letter-spacing:0.04em`, `padding:5px 12px`, `border-radius:6px` (squared-off corners to match the pixel face). Same dark translucent pill. Fixed-position inside `#story-name-tags` layer.
- **Name tag vertical lift:** `container.worldY + 0.46`. Medium head height is `0.58`, so the head top sits at `+0.29` above the container origin. `0.46` = `0.29 + 0.17` → ~0.17 world-unit clearance above the head top. Tune the `+ 0.46` constant in `updateStoryNameTags()` if head sizes ever change significantly.

### Using this in the simulation builder (and beyond)

The simulation-builder is the first downstream consumer that'll reuse this. Any time a simulation renders talking characters, it should:

1. Build heads with `{ slot, container, label }` — `label` can be whatever makes sense (`"ANCHOR"`, character name, line speaker tag).
2. Call `updateStoryNameTags` every tick from the simulation's render loop.
3. Call `showSubtitle` / `setSubtitleWord` / `hideSubtitle` as lines start/end, feeding `wordIdx` from the VisemeEngine's `getParams()`.
4. Call `removeSubtitle()` + `removeStoryNameTags()` on teardown so DOM state doesn't leak between simulations.

The caption + label system doesn't care whether it's driven by a Story asset, a simulation script, or a one-off trailer — it just needs the `heads[]` shape and a `wordIdx`. Keep it that way; don't make it know about story-specific concerns.

### Things to watch out for

- **The caption's vertical anchor assumes `#play-wrap` exists at `bottom:174px` with a 72px tall button.** If that layout ever changes, the `bottom:210px` constant in `_ensureSubtitleEl()` needs to move with it.
- **Name-tag lift assumes medium-preset head height (0.58).** If a simulation uses taller/shorter heads, the `+ 0.46` world-offset will look off. Consider parameterising per-head in a future pass.
- **Caption tokenisation must match VisemeEngine tokenisation** (`text.split(/\s+/).filter(w => w.length > 0)`), otherwise `wordIdx` will point at the wrong word. If VisemeEngine ever changes how it splits lines (e.g. punctuation handling), update `showSubtitle()` too.
- **One subtitle at a time, one speaking slot at a time.** The system is deliberately not multi-track. If a future feature needs simultaneous speakers, this needs a richer `_subtitleState` that keys off slot or line id.
- **Cache-bust on edits.** Both StoryBridge.js and previewRenderer.js import `shared/archetypeHead.js?v=N`. Bump `N` whenever you change the module's public behaviour so browsers pick it up.

---

## Working With Pietro

Pietro is non-technical (not a developer) but very engaged with the product. He prefers clear, step-by-step communication. When explaining technical decisions, keep it simple and concrete. He uses Cowork/Claude sessions to build and iterate on the project, so this guide and `AGENTS.md` are the primary ways context is preserved between sessions. Pietro prefers working with the Claude desktop app over the terminal/CLI.
