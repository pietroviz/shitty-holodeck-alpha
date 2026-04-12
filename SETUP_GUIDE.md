# Setup Guide — Pietro's Simulator Lab

Follow these steps to get everything connected. You only need to do this once.

---

## Step 1: Set Up Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open your project (or create a new one).

2. Go to **Settings → API** and copy:
   - `Project URL` (looks like `https://xxxxx.supabase.co`)
   - `anon / public` key

3. In your project folder, copy the env example file:
   ```bash
   cp .env.local.example .env.local
   ```

4. Paste your Supabase URL and anon key into `.env.local`.

5. Run the database schema:
   - Go to **SQL Editor** in the Supabase dashboard
   - Open `supabase/migrations/00001_initial_schema.sql` from your project
   - Copy/paste it into the SQL Editor and click **Run**

6. Enable email auth:
   - Go to **Authentication → Providers** in the dashboard
   - Make sure **Email** is enabled (it is by default)
   - Under **Email Templates**, you can customize the magic link email later

---

## Step 2: Push to GitHub

Run these commands from your project folder:

```bash
# Add all files and create the first commit
git add .
git commit -m "Initial scaffold: Next.js + Supabase + Auth"

# Create a new repo on GitHub (requires GitHub CLI — install from https://cli.github.com)
gh repo create pietros-simulator-lab --private --source=. --push

# Or if you prefer to create the repo on github.com manually:
# 1. Go to github.com/new
# 2. Create a new private repo (don't add README or .gitignore)
# 3. Then run:
#    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
#    git push -u origin main
```

---

## Step 3: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select your GitHub repo
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**

That's it! Vercel will:
- Build and deploy your app
- Give you a URL like `https://your-project.vercel.app`
- Auto-redeploy every time you push to GitHub

---

## Step 4: Connect Supabase Auth to Your Domain

After Vercel gives you a URL:

1. Go to your Supabase dashboard → **Authentication → URL Configuration**
2. Set **Site URL** to your Vercel URL (e.g., `https://your-project.vercel.app`)
3. Add `https://your-project.vercel.app/auth/callback` to **Redirect URLs**

---

## Step 5: Test on Your Phone

Just open your Vercel URL on your phone's browser! Since it's a web app, it works on any device immediately — no app store needed.

For a more app-like experience later, we can add a PWA manifest so it can be "installed" on your home screen.

---

## Day-to-Day Workflow

Once set up, your workflow becomes:

1. **Edit code** locally or with Claude
2. **Commit and push** to GitHub:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```
3. **Vercel auto-deploys** — check your live URL in ~60 seconds
4. **Test on phone** — just refresh the page

---

## Project Structure

```
├── src/
│   ├── app/                    # Next.js pages (file-based routing)
│   │   ├── page.tsx            # Homepage (landing page)
│   │   ├── dashboard/          # Dashboard showing all simulators
│   │   ├── simulators/         # Individual simulator pages
│   │   │   └── example/        # Example simulator template
│   │   ├── auth/               # Login and auth callback
│   │   └── api/                # API routes (sign out, etc.)
│   ├── components/             # Reusable React components
│   │   └── ui/                 # UI primitives (buttons, cards, etc.)
│   ├── lib/
│   │   └── supabase/           # Supabase client setup
│   │       ├── client.ts       # Browser-side client
│   │       ├── server.ts       # Server-side client
│   │       ├── middleware.ts   # Auth session management
│   │       └── types.ts        # TypeScript types for your DB
│   └── simulators/             # Staging area for raw simulator files
├── supabase/
│   └── migrations/             # SQL schema files
├── middleware.ts               # Next.js middleware (auth token refresh)
├── vercel.json                 # Vercel deployment config
├── .env.local.example          # Template for environment variables
└── SETUP_GUIDE.md              # This file
```

---

## Adding a New Simulator

1. Create a new folder: `src/app/simulators/your-simulator-name/page.tsx`
2. Use `src/app/simulators/example/page.tsx` as a template
3. Add it to the dashboard cards in `src/app/dashboard/page.tsx`
4. Commit, push, and it's live!
