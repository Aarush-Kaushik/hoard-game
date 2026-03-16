# 🎴 HOARD — Online Multiplayer Card Game

> *"A card game that ends your friendships"*

A fully playable, real-time multiplayer card game for 2–8 players built with **Node.js**, **Socket.IO**, and vanilla **HTML/CSS/JS**.

---

## 🚀 Quick Start (Local)

```bash
# 1. Install Node.js (https://nodejs.org) if not already installed

# 2. Navigate to the project folder
cd hoard-game

# 3. Install dependencies
npm install

# 4. Start the server
npm start

# 5. Open in browser
#    http://localhost:3000
```

Share the **Room Code** with friends on the same network. For online play, see [Hosting Online](#-hosting-online-free) below.

---

## 📖 Game Rules (from game_overview.docx)

### Overview
- **2–8 players** per game
- Each player starts with **7 cards**
- **Win condition**: First player to reach **15 or more cards** wins!
- **Elimination**: If you have **0 cards** at the end of your turn, you're **out**
- When you eliminate a player, you earn **2 bonus cards** as a reward
- Player turn order is **fixed** at the start and cannot change
- Players **must** play a card each turn (unless skipped by Cancel)
- Hands are **private** at all times

### Card Types

| Type | Color | Copies | Description |
|------|-------|--------|-------------|
| **Basic** | 🟡 Yellow | 4 each | Simple but effective cards |
| **Misery** | 🔴 Red | 4 each | Cards that cause the most trouble |
| **Advanced** | 🔵 Blue | 4 each | Powerful but not game-changing |
| **Passive** | 🟢 Green | 4 each | Cards that don't actively hurt anyone |
| **Crazy** | 🟣 Purple | 1 each | The best of the best. Game-changing! |

### All Cards & Abilities

#### Basic Cards (4 each)
- **Draw** — Pick up 2 random cards from the card stack
- **Steal** — Steal 2 cards from any player (victim chooses which to give)
- **Exchange** — Exchange one of your cards with another player (cannot exchange an Exchange card)

#### Misery Cards (4 each)
- **Revenge** — When this card is stolen, the stealer must give you 2 of their cards on their next turn
- **Blank** — Cancels the next card's ability. Does not affect Crazy or Passive cards. Applies once.
- **Choice** — Target player either gives you 1 card OR puts 2 of their cards at the bottom of the deck

#### Advanced Cards (4 each)
- **Vaporize** — Deletes 2 cards from any player (target chooses which; deleted cards go to bottom of deck)
- **Flip** — Reverses the effect of the last card played. Does not work on Crazy, Passive, or multi-target cards
- **Cancel** — Skips any player's next turn

#### Passive Cards (4 each)
- **Present** — Gives 2 cards from the deck to any player (including yourself)
- **Shield** — You are protected from the next card played against you
- **Raccoon** — Every round, gain 1 random card from the deck. Max 3 cards total. Only 1 Raccoon can be active at a time

#### Crazy Cards (1 each!)
- **FRENZY** — Play up to 3 additional cards this turn (not Crazy or Passive)
- **DISABLE** — Permanently bans a card type. All players holding that card must discard it
- **COPYCAT** — Copies the ability of the last card played
- **SHUFFLE** — Reshuffles ALL players' cards randomly. Everyone gets the same number of cards back

### Special Rules
- **Deleted cards** go to the bottom of the card stack
- **Stolen cards**: The person being stolen from chooses which cards to give
- **Revenge trap**: Triggers when someone steals this card from your hand
- A **round** ends when every active player has had a turn
- **Blank** does NOT cancel Crazy or Passive cards

---

## 🌐 Hosting Online (Free) — Full Guide

> **Goal**: Get a public URL like `https://your-hoard-game.onrender.com` so anyone in the world can play!

### Step 0: Push to GitHub First (Required for Most Platforms)

Most hosting platforms deploy from a GitHub repo. Do this once:

```bash
# In the hoard-game/ folder:
git init
git add .
git commit -m "Initial commit - Hoard card game"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/hoard-game.git
git branch -M main
git push -u origin main
```

If you don't want to use GitHub, **Glitch** and **Replit** support direct file upload.

---

### Option 1: Render (Recommended — Free, Reliable)

Render is the easiest for Node.js + WebSocket apps.

1. **Create account** at [render.com](https://render.com) (free, no credit card needed)
2. Click **New +** → **Web Service**
3. **Connect your GitHub** account and select the `hoard-game` repository
4. Configure the service:
   - **Name**: `hoard-game` (this becomes your URL: `hoard-game.onrender.com`)
   - **Region**: Pick the closest to your players
   - **Branch**: `main`
   - **Root Directory**: leave blank (or set to `hoard-game` if it's in a subfolder)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `PORT` = `10000` (Render assigns this automatically, but add it to be safe)
6. Click **Create Web Service**
7. Wait 2–3 minutes for the build to complete
8. **Your live URL** appears at the top: `https://hoard-game.onrender.com`

> ⚠️ **Free tier note**: Render free services spin down after 15 minutes of inactivity. The first visit after idle may take ~30 seconds to start up. Gameplay is unaffected once running.

**Share with friends**: Send them `https://hoard-game.onrender.com` — they open it in any browser and play!

---

### Option 2: Railway (Fast Deploys, Free Tier)

1. **Create account** at [railway.app](https://railway.app) (GitHub login recommended)
2. Click **New Project** → **Deploy from GitHub Repo**
3. Select your `hoard-game` repository
4. Railway auto-detects Node.js and runs `npm install` + `npm start`
5. Go to **Settings** tab of your service:
   - **Start Command**: `npm start` (should be auto-detected)
6. Go to **Networking** tab:
   - Click **Generate Domain** — this gives you your public URL like `hoard-game-production.up.railway.app`
7. **Environment Variables** (Settings → Variables):
   - Railway auto-sets `PORT` — no action needed
8. Deploy happens automatically. Check **Deployments** tab for status.

> ⚠️ **Free tier**: Railway gives $5/month free credits (~500 hours of runtime). More than enough for casual play.

**Your live URL**: Found in the **Networking** tab → the generated domain.

---

### Option 3: Glitch (No GitHub Needed, Instant)

Glitch is great if you don't want to set up GitHub.

1. **Create account** at [glitch.com](https://glitch.com)
2. Click **New Project** → **Import from GitHub** (paste your repo URL)
   - **OR** click **New Project** → **glitch-hello-node**, then:
     - Click **Tools** (bottom-left) → **Import/Export** → **Import from GitHub**
     - Or manually upload: Click each file in the editor sidebar and paste content
3. Make sure `package.json` is at the root of the project
4. Glitch automatically runs `npm install` and `npm start`
5. Click **Share** (top-left) → copy the **Live Site** URL
   - URL format: `https://your-project-name.glitch.me`

> ⚠️ **Free tier**: Projects sleep after 5 minutes of inactivity and take a few seconds to wake up. Use [UptimeRobot](https://uptimerobot.com) (free) to ping your project every 5 minutes to keep it awake.

**Edit live**: You can edit code directly in the Glitch editor — changes deploy instantly!

---

### Option 4: Replit (Beginner-Friendly, Built-in Editor)

1. **Create account** at [replit.com](https://replit.com)
2. Click **Create Repl** → Template: **Node.js**
3. **Upload files**: Drag & drop all project files into the file sidebar, maintaining the folder structure:
   ```
   server/index.js
   server/gameLogic.js
   server/roomManager.js
   public/index.html
   public/styles.css
   public/game.js
   public/assets/cards/*.png
   package.json
   ```
4. Click the **Run** button (green ▶ at top)
5. Replit opens a **Webview** panel showing your game
6. Click **Open in new tab** in the Webview to get the public URL
   - URL format: `https://your-repl-name.your-username.repl.co`

> ⚠️ **Free tier**: Repls sleep when inactive. Use the **Always On** power-up (paid) or [UptimeRobot](https://uptimerobot.com) to keep it alive.

---

### Option 5: Fly.io (More Technical, Generous Free Tier)

1. Install the Fly CLI: [fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Sign up: `flyctl auth signup`
3. In the `hoard-game/` folder, run:
   ```bash
   flyctl launch
   # Choose app name, region, and say YES to deploy
   ```
4. Fly auto-detects Node.js, creates a config, and deploys
5. Your URL: `https://your-app-name.fly.dev`

> ✅ Fly.io free tier includes 3 shared VMs — plenty for a card game server.

---

### 🔗 Sharing the Game with Friends

Once hosted, your game has a **public URL** (e.g., `https://hoard-game.onrender.com`). To play:

1. **Send the URL** to friends via Discord, WhatsApp, text, etc.
2. Everyone opens the URL in their browser (desktop or mobile — both work!)
3. One person enters their name and clicks **Create Room**
4. They share the **6-character Room Code** with friends
5. Friends enter their name + the code → click **Join by Code**
6. Host clicks **Start Game** once 2–8 players have joined
7. **That's it!** No downloads, no installs, just play.

### 🔌 WebSocket / Firewall Notes

- This game uses **WebSockets** (via Socket.IO) for real-time communication
- All hosting platforms listed above support WebSockets on their free tiers
- If players are on a corporate/school network that blocks WebSockets, Socket.IO will **automatically fall back to HTTP polling** — the game still works, just slightly less responsive
- No special firewall configuration is needed for players — it's just a website

---

## 🛠️ Customization Guide

### Adding New Cards
1. **Server**: Edit `server/gameLogic.js` → add entry to `CARD_DEFINITIONS`
2. **Server**: Edit `server/roomManager.js` → add a `case` in `resolveCardAbility()`
3. **Client**: Add the card image to `public/assets/cards/{CardName}.png`
4. **Client**: Add the card name to `CARD_TYPES` in `public/game.js`
5. If the card needs a target, add it to `TARGET_CARDS` array in `game.js`

### Customizing Card Graphics
- Replace PNGs in `public/assets/cards/` with your own designs
- Keep the same filenames (e.g., `Draw.png`, `Steal.png`)
- Recommended size: ~400×560px (portrait)

### Changing Room Limits
Edit `server/roomManager.js`:
```javascript
const MIN_PLAYERS = 2;   // Change minimum players
const MAX_PLAYERS = 8;   // Change maximum players
```

### Changing Starting Hand Size
Edit `server/gameLogic.js` → `dealCards()` function:
```javascript
for (let i = 0; i < 7; i++) {  // Change 7 to desired count
```

### Changing Win Condition
Edit `server/gameLogic.js` → `checkWinCondition()`:
```javascript
if (hand && hand.length >= 15) return { type: 'win', playerId };
// Change 15 to your desired win count
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Server not responding** | Check `npm start` output for errors. Ensure port 3000 is free. Try `PORT=8080 npm start` |
| **Player desync** | Refresh the browser. The server maintains all game state |
| **Cards not showing** | Ensure card images exist in `public/assets/cards/` with exact names |
| **Can't join room** | Check the room code is correct (case-insensitive). Room may be full or game started |
| **Blank screen** | Check browser console (F12) for errors. Ensure Socket.IO is loading |
| **Port in use** | Kill the existing process or use a different port: `set PORT=8080 && npm start` |
| **Mobile layout issues** | The app is responsive; try rotating your device |

---

## 📂 Project Structure

```
hoard-game/
├── server/
│   ├── index.js          # Express + Socket.IO server entry point
│   ├── gameLogic.js      # Card definitions, deck builder, core game functions
│   └── roomManager.js    # Room CRUD, turn management, ALL card ability resolution
├── public/
│   ├── index.html        # Game UI (lobby, waiting room, game board, modals)
│   ├── styles.css        # Complete stylesheet (dark theme, responsive)
│   ├── game.js           # Client socket events, rendering, card interactions
│   └── assets/
│       └── cards/        # Individual card PNG images
│           ├── Draw.png
│           ├── Steal.png
│           ├── Exchange.png
│           ├── Revenge.png
│           ├── Blank.png
│           ├── Choice.png
│           ├── Vaporize.png
│           ├── Flip.png
│           ├── Cancel.png
│           ├── Present.png
│           ├── Shield.png
│           ├── Raccoon.png
│           ├── Frenzy.png
│           ├── Disable.png
│           ├── Copycat.png
│           └── Shuffle.png
├── package.json
└── README.md
```

---

## 📜 License

MIT — Free to use, modify, and share. Have fun! 🎴
