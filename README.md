# Work Visa Navigator — Setup & Deployment Guide

A personal tool to find accredited employers and visa-sponsored jobs in New Zealand and Australia, matched against your CV.

## What this actually does (and doesn't do)

- **Employer lists**: Either you upload your own file (Excel/CSV/PDF/Word/screenshot), or the app asks Claude to web-search and compile a list. There is no official bulk-downloadable employer list from Immigration NZ or Australia's Home Affairs, so AI-compiled lists are clearly labeled and should be spot-checked, not trusted blindly.
- **Job search**: For each employer in your active list, the app asks Claude to web-search that employer's own careers page for current openings, flagging ones that look like they sponsor visas. Where a careers page can't be read (login walls, heavy JavaScript), the app marks it "manual check needed" with a direct link instead of guessing.
- **Match scoring**: Each found job is scored against your selected CV's text content, with a percentage, a reason, and what's missing from your CV for that role.
- **Storage**: CVs (up to 5, pin to protect from rotation), employer lists (up to 5 per country), and search results (up to 4 per country) are saved in a simple local JSON database file on your server — nothing is sent anywhere except to the Anthropic API for AI processing.

## Architecture

```
visa-app/
  server/    — Node/Express backend (holds your API key, does all AI calls)
  client/    — React frontend (talks to your backend only, never to Anthropic directly)
```

This is intentionally split so your Anthropic API key never touches the browser — it lives only on the server.

---

## Part 1: Run it locally first (recommended before deploying)

### Backend

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and paste in your real Anthropic API key (get one at https://console.anthropic.com/settings/keys):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then start it:

```bash
npm start
```

You should see `✅ Server running on http://localhost:3001`.

### Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The app should load and talk to your local backend automatically.

---

## Part 2: Does this consume your Claude.ai subscription?

**No, once deployed this way.** This app calls the Anthropic API directly using your own API key, billed separately and directly through your Anthropic Console account — completely independent of any claude.ai Pro/Max subscription. You'll need to add billing/credits to your Anthropic Console account (https://console.anthropic.com/settings/billing) for the API key to work; API usage is pay-per-token, not bundled with a claude.ai chat subscription.

Since this is for personal use only, costs should be small — each job search does 1-2 AI calls (web search + matching), so realistically cents per search session, not dollars, under normal personal use. You can monitor exact spend in the Anthropic Console.

---

## Part 3: Deploying for free so you don't have to keep your own computer running

### Backend → Render (free tier)

1. Push the `server/` folder to a GitHub repo (or the whole `visa-app/` folder, doesn't matter).
2. Go to https://render.com → New → Web Service → connect your GitHub repo.
3. Set **Root Directory** to `server` (if you pushed the whole project).
4. Build command: `npm install`
5. Start command: `npm start`
6. Under Environment, add:
   - `ANTHROPIC_API_KEY` = your real key
   - `CLIENT_ORIGIN` = the URL your frontend will be hosted at (you'll fill this in after step below, e.g. `https://your-app.vercel.app`)
7. Deploy. Render gives you a URL like `https://your-backend.onrender.com`.

Note: Render's free tier sleeps after inactivity and takes ~30-60 seconds to wake up on the next request — fine for personal use, just expect a delay on the first search after idling.

### Frontend → Vercel (free tier)

1. Go to https://vercel.com → New Project → import the same GitHub repo.
2. Set **Root Directory** to `client`.
3. Add an environment variable: `VITE_API_URL` = `https://your-backend.onrender.com/api` (your actual Render URL from above, with `/api` on the end).
4. Deploy. Vercel gives you a URL like `https://your-app.vercel.app`.
5. Go back to Render and update `CLIENT_ORIGIN` to this exact Vercel URL, then redeploy the backend so CORS allows it.

That's it — visit your Vercel URL and the app runs fully standalone, costing you nothing except your own direct Anthropic API usage.

---

## Part 4: Important security notes

- Never commit your real `.env` file or API key to GitHub — `.env` is already gitignored.
- Since this is personal-use only and not public, there's no need for user accounts/login — but if you ever do make it public, you'd need to add rate limiting and possibly per-user API budgets, since every visitor's search would draw from your single API key's billing.
- The app does not store or require any website login credentials. The job search reads publicly available careers pages only; anything behind a login is flagged for you to check manually.
