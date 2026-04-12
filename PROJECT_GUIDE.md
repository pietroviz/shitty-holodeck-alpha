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

## GitHub Authentication Setup (One-Time, Per Machine)

Without this setup, pushing to GitHub from the terminal will fail or require pasting tokens manually. This only needs to be done once per computer.

### Prerequisites
- macOS with Terminal access
- A GitHub account (Pietro's: @pietroviz)

### Step 1: Install Homebrew (if not already installed)
Open Terminal (Applications → Utilities → Terminal, or search "Terminal" in Spotlight) and paste:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Follow the prompts. If it says Homebrew is already installed, skip to Step 2.

### Step 2: Install the GitHub CLI
```
brew install gh
```

### Step 3: Log in to GitHub
```
gh auth login
```
This runs in Terminal but walks you through it interactively:
1. It asks "What account?" → pick **GitHub.com** (use arrow keys, press Enter)
2. It asks "Preferred protocol?" → pick **HTTPS**
3. It asks "Authenticate Git?" → pick **Yes**
4. It asks "How to authenticate?" → pick **Login with a web browser**
5. It shows a short code (like `A1B2-C3D4`) and opens your browser automatically
6. Paste that code into the GitHub page in your browser and click "Authorize"
7. Terminal will confirm you're logged in

After this, `git push` and `git pull` will just work from any session on that machine — no more token workarounds.

### Verifying it worked
Run this in Terminal to confirm:
```
gh auth status
```
It should show your GitHub username and say "Logged in to github.com".

---

## Known Issues & Gotchas

1. **Supabase dashboard renders black** in browser automation sessions. Workaround: use the Management API (`api.supabase.com/v1/projects/...`) or execute JavaScript in the dashboard page context.
2. **The `simulators` table and route paths** still use the old naming. The DB table doesn't need renaming (it's internal), but if new routes are created, prefer `/experiences/` over `/simulators/`.
3. **There's a `Simulator` type in `types.ts`** — keep it for now since it matches the DB table name, but new types should use the updated naming.
4. **Cookie clearing quirks:** The `site_access` cookie is `httpOnly`, so browser extensions and some "clear cookies" options don't remove it. Users need to do a full site data clear or use incognito to reset the gate.

---

## Working With Pietro

Pietro is non-technical (not a developer) but very engaged with the product. He prefers clear, step-by-step communication. When explaining technical decisions, keep it simple and concrete. He uses Cowork/Claude sessions to build and iterate on the project, so this guide and `AGENTS.md` are the primary ways context is preserved between sessions.
