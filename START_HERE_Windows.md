# START HERE — Windows Setup (Step by Step)

This guide assumes you've never installed developer tools before. Follow it top to bottom in order.

---

## Step 1: Install Node.js (one-time, ~5 minutes)

1. Go to **https://nodejs.org** in your browser.
2. You'll see two download buttons — click the one labeled **"LTS"** (this means "Long Term Support," the stable version). Do not pick the other one.
3. Once downloaded, double-click the installer file (something like `node-v20.x.x-x64.msi`).
4. Click "Next" through the installer using all the default settings — you don't need to change anything. Click "Install," then "Finish."
5. **Restart your computer** after this (important — Windows needs a restart for Node to be recognized properly).

### Verify it worked:
1. Press the **Windows key**, type `cmd`, and press Enter to open Command Prompt.
2. Type this and press Enter:
   ```
   node -v
   ```
3. You should see something like `v20.11.0`. If you see an error instead, the restart in step 5 was likely skipped — restart and try again.

---

## Step 2: Install VS Code (optional, but makes life easier)

1. Go to **https://code.visualstudio.com**
2. Click the big blue "Download for Windows" button.
3. Run the installer, click "Next" through the defaults, then "Finish."

You'll use this just to open the project folder and edit one file (your API key) — Notepad works too if you'd rather skip this.

---

## Step 3: Unzip this project

1. Right-click `visa-sponsor-app.zip` → "Extract All" → choose a simple location like `C:\visa-app` (avoid Desktop/OneDrive folders, they sometimes cause path issues).
2. Open the extracted `visa-app` folder.

---

## Step 4: Get your Anthropic API key

1. Go to **https://console.anthropic.com**
2. Sign up or log in.
3. Go to **Settings → API Keys** → "Create Key."
4. Copy the key (starts with `sk-ant-...`) — you'll only see it once, so paste it somewhere safe immediately.
5. You'll also need to add billing — go to **Settings → Billing** and add a card. Personal use costs are typically small (cents per search), but the key won't work without billing enabled.

---

## Step 5: Add your API key to the project

1. Open the `visa-app/server` folder.
2. Find the file called `.env.example`. Make a copy of it and rename the copy to exactly `.env` (no `.example` at the end).
   - If Windows hides file extensions and you can't see `.example`, that's fine — just copy the file, rename it to `.env`, and Windows will ask to confirm changing the file type — say yes.
3. Open `.env` with VS Code or Notepad. Replace `sk-ant-your-key-here` with your real key from Step 4. Save the file.

---

## Step 6: Run the backend

1. Open Command Prompt (Windows key → type `cmd` → Enter).
2. Navigate to the server folder by typing (adjust the path if you unzipped somewhere else):
   ```
   cd C:\visa-app\server
   ```
3. Install the required packages (one-time, takes a minute or two):
   ```
   npm install
   ```
4. Start the server:
   ```
   npm start
   ```
5. You should see: `✅ Server running on http://localhost:3001`
6. **Leave this Command Prompt window open** — closing it stops the backend.

---

## Step 7: Run the frontend

1. Open a **second**, separate Command Prompt window (don't close the first one).
2. Navigate to the client folder:
   ```
   cd C:\visa-app\client
   ```
3. Install packages:
   ```
   npm install
   ```
4. Start it:
   ```
   npm run dev
   ```
5. It will print a URL, usually `http://localhost:5173`. Open that link in your browser (Chrome, Edge, whatever you normally use).

---

## You're running it locally now

The app should load in your browser and work. Both Command Prompt windows need to stay open while you're using it — closing them shuts the app down.

When you're ready to make this permanently accessible (including from your phone) without keeping your computer on, see the **"Part 3: Deploying for free"** section in the main `README.md` file in this folder.

---

## If something goes wrong

- **"npm is not recognized"** → Node.js wasn't installed properly, or you skipped the restart in Step 1. Reinstall and restart.
- **Server starts but the app shows a connection error** → Make sure both Command Prompt windows (backend AND frontend) are still open and running.
- **"Cannot find module" errors** → You likely skipped the `npm install` step in that folder. Run it again.
- Anything else — copy the exact error text and ask Claude to help debug it.
