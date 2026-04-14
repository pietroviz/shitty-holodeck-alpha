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
SITE_PASSWORD=pppicard
```

These same values are set in **Vercel → Settings → Environment Variables** for production.

---

## Auth & Access Flow

The site has a **two-layer access system**:

### Layer 1: Password Gate
- Every visitor hits the gate first (`/gate`)
- They enter a shared password (`pppicard`) — this is a simple private beta gate, not per-user auth
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

## Working With Pietro

Pietro is non-technical (not a developer) but very engaged with the product. He prefers clear, step-by-step communication. When explaining technical decisions, keep it simple and concrete. He uses Cowork/Claude sessions to build and iterate on the project, so this guide and `AGENTS.md` are the primary ways context is preserved between sessions. Pietro prefers working with the Claude desktop app over the terminal/CLI.
