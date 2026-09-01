# Iskan Drama

Short drama streaming SPA — Transmit theme edition.  
Plays mini-drama series directly in browser via HLS.js (no iframe, no ads gate).

## Stack

- **Express** (`app.js`) — raw pass-through proxy to upstream API + static SPA server
- **Vanilla JS SPA** (`public/js/main.js`) — hash routing, in-place provider filter, debounced search
- **Tailwind CSS** (`public/css/tailwind.css` → `public/css/styles.css`) — Transmit dark theme
- **HLS.js** (vendored at `public/vendor/hls.min.js`) — native HLS playback, no video proxy needed

## Routes

| Route | Description |
|-------|-------------|
| `/` | SPA entry (`public/index.html`) |
| `/api/raw/*` | Pass-through proxy → `TARGET_API/*` (strips upstream branding) |
| `/api/stream/:bookId?ep=&provider=&title=&lang=` | Resolves real `.m3u8` URL from watch page |
| `/health` | Health check |

## Environment

Copy `.env.example` → `.env` and adjust:

| Key | Default | Description |
|-----|---------|-------------|
| `PORT` | `3003` | HTTP port |
| `TARGET_API` | `https://narto-drama.com` | Upstream API origin |
| `NODE_ENV` | `production` | Node env |
| `API_TIMEOUT_MS` | `15000` | Upstream request timeout |

## Develop

```bash
# install deps
npm ci

# build CSS (required before first run)
npm run build:css

# start server
npm start
# → http://localhost:3003

# watch CSS while developing
npm run watch:css
```

## Project structure

```
├── app.js                 # Express server + proxy + stream resolver
├── package.json
├── tailwind.config.js
├── .env                   # (gitignored) local config
├── .env.example           # template
├── public/
│   ├── index.html         # SPA shell
│   ├── css/
│   │   ├── tailwind.css   # source (edit this)
│   │   └── styles.css     # built (gitignored in some setups, committed here)
│   ├── js/
│   │   └── main.js        # SPA logic (hash routing, render, player)
│   ├── vendor/
│   │   └── hls.min.js     # HLS.js (vendored, no CDN)
│   └── images/            # logo.png, fallback.png, empty.png (generated)
├── scripts/
│   └── mkplaceholders.js  # generates placeholder images
└── .gitignore
```

## Cross-platform notes

- All paths use `path.join(__dirname, ...)` — works on Windows & Linux.
- `express.static` serves `public/` as-is; no platform-specific code.
- HLS streams from upstream have CORS `*` → play directly in browser via HLS.js.
- Upstream (narto-drama.com) rate-limits ~503/60s; proxy does **not** cache — keep calls minimal.
- Branding strip in `/api/raw/*` removes "narto drama" text & URLs from upstream JSON recursively.

## Deploy

Any Node host (PM2, systemd, Docker, Railway, Render, Fly.io, etc.).  
Set `PORT`, `TARGET_API`, `NODE_ENV=production`, `API_TIMEOUT_MS` in env.