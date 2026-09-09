// iskan-drama — zero-dep native http server (AsiaBox Drama + Narto failover)
// Node >= 18 (global fetch). Routes:
//   GET /                      -> public/index.html
//   GET /<static>              -> public/ files
//   GET /api/asiabox/index     -> AsiaBox Drama index (cache 5m, SWR)
//   GET /api/asiabox/search    -> AsiaBox search (cache 10m)
//   GET /api/asiabox/detail/:s -> AsiaBox detail scraper
//   GET /api/asiabox/watch/:s/:ep -> AsiaBox watch resolver (cache 30m)
//   GET /api/narto/index       -> Aliased / fallback to AsiaBox/Narto
//   GET /api/narto/watch/...   -> Aliased / fallback to AsiaBox/Narto
//   GET /api/proxy/m3u8        -> m3u8/segment proxy
//   GET /health
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3003', 10);
const TARGET_API = process.env.TARGET_API || 'https://asiaboxdrama.com';
const PUBLIC = path.join(__dirname, 'public');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// ---------- helpers ----------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendErr(res, status, msg, code) {
  sendJSON(res, status, { ok: false, message: msg || 'error', code: code || '' });
}

function cleanSynopsis(s) {
  if (!s) return '';
  return String(s)
    .replace(/(?:streaming\s+gratis\s+|saksikan\s+kisah\s+lengkapnya\s+gratis\s+|nonton\s+kisah\s+lengkapnya\s+gratis\s+|nonton\s+full\s+episode\s+gratis\s+|gratis\s+)?hanya\s+di\s+asiabox(?:drama)?(?:\.com)?\.?/gi, '')
    .replace(/https?:\/\/(?:www\.)?asiaboxdrama\.(?:com|shop)[^\s]*/gi, '')
    .replace(/asiabox(?:drama)?(?:\.com)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

async function getText(url, opts = {}) {
  const { headers = {}, timeout = 25000, redirect = 'follow' } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect, signal: ctrl.signal });
    const text = await r.text();
    return { status: r.status, url: r.url, text };
  } finally {
    clearTimeout(t);
  }
}

// ---------- caches ----------
const asiaboxIndexCache = new Map();  // `${category}:${page}` -> {data, ts}
const INDEX_CACHE_TTL = 5 * 60 * 1000;
const asiaboxWatchCache = new Map();  // `${slug}` -> {data, ts}
const WATCH_CACHE_TTL = 30 * 60 * 1000;
const asiaboxSearchCache = new Map(); // `${query}` -> {data, ts}
const SEARCH_CACHE_TTL = 10 * 60 * 1000;

// ---------- AsiaBox Parsers ----------
const ASIABOX_PROVIDERS = [
  { key: 'all', label: 'Beranda' },
  { key: 'drama-pendek-china', label: 'Dracin Pendek' },
  { key: 'drama-pendek-barat', label: 'Drama Barat' },
  { key: 'genre-ceo', label: 'Tema CEO' },
  { key: 'genre-cultivation', label: 'Kultivasi / Silat' },
  { key: 'drama-pendek-animasi', label: 'Animasi' },
  { key: 'donghua-series', label: 'Donghua' },
  { key: 'serial-drama-china', label: 'Serial Drama' },
];

function extractSectionFromRSC(secName, rawPush) {
  const key = `\\"${secName}\\":{\\"status\\":true,\\"data\\":{\\"entries\\":[`;
  const idx = rawPush.indexOf(key);
  if (idx < 0) return [];
  const start = idx + key.length - 1;
  let depth = 0, end = -1;
  for (let i = start; i < rawPush.length; i++) {
    if (rawPush[i] === '[') depth++;
    else if (rawPush[i] === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return [];
  try {
    const rawJson = rawPush.slice(start, end)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    const entries = JSON.parse(rawJson);
    return entries.map(it => ({
      id: it.slug || it.id,
      book_id: it.slug || it.id,
      slug: it.slug,
      code: secName,
      provider: 'AsiaBox',
      title: it.title,
      description: cleanSynopsis(it.description || ''),
      poster: it.image ? it.image.replace(/\\/g, '') : '',
      total_eps: it.episodes_count || null,
      episodes: it.episodes_count || null,
      tags: (it.tags || []).map(t => t.name),
      watch_url: `/api/asiabox/watch/${encodeURIComponent(it.slug || it.id)}/1`,
      external_url: `https://asiaboxdrama.com/id/movie/${it.slug}`
    }));
  } catch (e) {
    return [];
  }
}

function parseItemsFromRSC(html, defaultCat = 'drama-pendek-china') {
  const pushes = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/g)).map(m => m[1]);
  const out = [];
  const seen = new Set();

  for (const p of pushes) {
    if (!p.includes('films') && !p.includes('episodes_count') && !p.includes('slug')) continue;
    try {
      const unescaped = p.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                         .replace(/\\"/g, '"')
                         .replace(/\\\\/g, '\\');
      
      const itemRegex = /\{"id":"([0-9a-f\-]+)","title":"(.*?)","meta_title".*?"slug":"(.*?)".*?"description":"(.*?)".*?"image":"(.*?)".*?"episodes_count":(\d+).*?\}/g;
      let m;
      while ((m = itemRegex.exec(unescaped)) !== null) {
        const id = m[1];
        const rawTitle = m[2];
        const slug = m[3];
        const desc = m[4];
        let img = m[5].replace(/\\/g, '');
        const eps = parseInt(m[6], 10);

        if (seen.has(slug || id)) continue;
        seen.add(slug || id);

        out.push({
          id: slug || id,
          book_id: slug || id,
          slug: slug,
          code: defaultCat,
          provider: 'AsiaBox',
          title: rawTitle,
          description: cleanSynopsis(desc || ''),
          poster: img,
          total_eps: eps,
          episodes: eps,
          tags: [],
          watch_url: `/api/asiabox/watch/${encodeURIComponent(slug || id)}/1`,
          external_url: `https://asiaboxdrama.com/id/movie/${slug}`
        });
      }
    } catch (err) {}
  }
  return out;
}

async function asiaboxFetchIndex(page = 1, provider = 'all') {
  let cat = provider || 'all';

  // Home view (page 1, all/home): Group into Popular 🚀 and Terbaru 🔥
  if (page === 1 && (cat === 'all' || cat === 'home' || cat === 'narto' || cat === 'bibishort')) {
    const targetUrl = 'https://asiaboxdrama.com/id';
    const r = await getText(targetUrl, { timeout: 25000 });
    if (r.status >= 400) throw new Error('AsiaBox upstream HTTP ' + r.status);

    const pushes = Array.from(r.text.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/g)).map(m => m[1]);
    let popItems = [];
    let latItems = [];

    for (const p of pushes) {
      if (p.includes('\\"popular\\"') || p.includes('\\"latest\\"')) {
        const pList = extractSectionFromRSC('popular', p);
        if (pList.length > 0) popItems = pList;
        const lList = extractSectionFromRSC('latest', p);
        if (lList.length > 0) latItems = lList;
      }
    }

    // Fallback if specific sections not found
    if (!popItems.length && !latItems.length) {
      const allItems = parseItemsFromRSC(r.text, 'all');
      popItems = allItems.slice(0, 18);
      latItems = allItems.slice(18);
    }

    const sections = [];
    if (popItems.length > 0) {
      sections.push({
        tab_key: 'popular',
        tab_label: 'Drama Popular 🚀',
        page: 1,
        items: popItems,
      });
    }
    if (latItems.length > 0) {
      sections.push({
        tab_key: 'latest',
        tab_label: 'Drama Terbaru 🔥',
        page: 1,
        items: latItems,
      });
    }

    return {
      ok: true,
      providers: ASIABOX_PROVIDERS,
      sections,
      page: 1,
      has_next: true,
      total_pages: null,
    };
  }

  const isHomeAll = (cat === 'all' || cat === 'home');
  const provKey = isHomeAll ? 'drama-pendek-china' : cat;
  const targetUrl = `https://asiaboxdrama.com/id/${encodeURIComponent(provKey)}?page=${page}`;

  const r = await getText(targetUrl, { timeout: 25000 });
  if (r.status >= 400) throw new Error('AsiaBox upstream HTTP ' + r.status);

  const items = parseItemsFromRSC(r.text, provKey);
  const provObj = ASIABOX_PROVIDERS.find(p => p.key === cat) || { key: cat, label: isHomeAll ? 'Semua Drama' : 'AsiaBox Drama' };
  const labelText = (isHomeAll ? 'Semua Drama' : provObj.label) + ' – Halaman ' + page;

  return {
    ok: true,
    providers: ASIABOX_PROVIDERS,
    sections: [{ tab_key: cat, tab_label: labelText, page, items }],
    page,
    has_next: items.length >= 15,
    total_pages: null,
  };
}

async function asiaboxSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: true, items: [], total: 0 };

  const hit = asiaboxSearchCache.get(q);
  if (hit && Date.now() - hit.ts < SEARCH_CACHE_TTL) return hit.data;

  const targetUrl = `https://asiaboxdrama.com/id/search?q=${encodeURIComponent(q)}`;
  const r = await getText(targetUrl, { timeout: 25000 });
  if (r.status >= 400) throw new Error('Search upstream HTTP ' + r.status);

  const items = parseItemsFromRSC(r.text, 'search');
  const result = { ok: true, items, total: items.length };
  asiaboxSearchCache.set(q, { data: result, ts: Date.now() });
  return result;
}

async function asiaboxFetchMovieDetail(slug) {
  const cleanSlug = String(slug || '').replace(/^\/id\/movie\//, '').trim();
  const hit = asiaboxWatchCache.get(cleanSlug);
  if (hit && Date.now() - hit.ts < WATCH_CACHE_TTL) return hit.data;

  const url = `https://asiaboxdrama.com/id/movie/${encodeURIComponent(cleanSlug)}`;
  const r = await getText(url, { timeout: 25000 });
  if (r.status >= 400) throw new Error(`Movie detail HTTP ${r.status}`);

  const html = r.text;

  // Extract all episode MP4 / video urls enclosed in quotes
  const rawUrls = Array.from(html.matchAll(/"(https?:\/\/[^"]+?\.(?:mp4|m3u8)[^"]*)"/g)).map(m => m[1]);
  // Extract all episode VTT subtitle urls
  const rawSubUrls = Array.from(html.matchAll(/"(https?:\/\/[^"]+?\.vtt[^"]*)"/g)).map(m => m[1]);

  const episodesMap = new Map();

  for (const raw of rawUrls) {
    const clean = raw.replace(/\\u0026/g, '&').replace(/\\/g, '');
    const epNumMatch = clean.match(/episode-(\d+)\.(?:mp4|m3u8)/i);
    const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : episodesMap.size + 1;
    const isM3u8 = clean.includes('.m3u8');
    if (!episodesMap.has(epNum)) {
      episodesMap.set(epNum, {
        ep: epNum,
        url: clean,
        subtitle: '',
        ext: isM3u8 ? 'm3u8' : 'mp4',
        quality: '720p'
      });
    }
  }

  for (const raw of rawSubUrls) {
    const clean = raw.replace(/\\u0026/g, '&').replace(/\\/g, '');
    const epNumMatch = clean.match(/episode-(\d+)\.vtt/i);
    if (epNumMatch) {
      const epNum = parseInt(epNumMatch[1], 10);
      if (episodesMap.has(epNum)) {
        episodesMap.get(epNum).subtitle = clean;
      }
    }
  }

  const episodes = Array.from(episodesMap.values()).sort((a, b) => a.ep - b.ep);

  // Title, description, poster
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  let title = titleMatch ? titleMatch[1].split('|')[0].trim() : cleanSlug;
  title = title.replace(/^Nonton\s+/i, '').replace(/\s+Drama Pendek Sub Indo Gratis$/i, '').trim();

  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const description = cleanSynopsis(descMatch ? descMatch[1] : '');

  // Extract real poster image from RSC pushes
  let poster = '';
  const imgMatch = html.match(/\\"(?:image|poster)\\":\\"([^"]+)\\"/) || html.match(/"(?:image|poster)":\s*"([^"]+)"/);
  if (imgMatch) {
    poster = imgMatch[1].replace(/\\\//g, '/').replace(/\\/g, '');
  }
  if (!poster || poster.includes('potrait-logo.webp')) {
    const ogMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (ogMatch && !ogMatch[1].includes('potrait-logo.webp')) {
      poster = ogMatch[1];
    }
  }

  const data = {
    ok: true,
    id: cleanSlug,
    book_id: cleanSlug,
    slug: cleanSlug,
    title,
    description,
    poster,
    total_eps: episodes.length,
    episodes: episodes.length,
    episode_list: episodes,
  };

  asiaboxWatchCache.set(cleanSlug, { data, ts: Date.now() });
  return data;
}

async function asiaboxResolveWatch(slug, epN = 1) {
  const detail = await asiaboxFetchMovieDetail(slug);
  if (!detail || !detail.episode_list || !detail.episode_list.length) {
    return { ok: false, message: 'Tidak ada video ditemukan untuk drama ini.', code: 'NO_EPISODES' };
  }

  const targetEp = parseInt(epN, 10) || 1;
  const epObj = detail.episode_list.find(e => e.ep === targetEp) || detail.episode_list[0];

  return {
    ok: true,
    url: epObj.url,
    subtitle: epObj.subtitle || '',
    book_id: detail.slug,
    slug: detail.slug,
    title: detail.title,
    poster: detail.poster,
    ep: epObj.ep,
    total_eps: detail.episode_list.length,
    episodes: detail.episode_list.length,
    ext: epObj.ext || 'mp4',
    episode_list: detail.episode_list,
  };
}

// ---------- static ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl',
};
function serveStatic(req, res, pathname) {
  let fp = path.join(PUBLIC, pathname);
  if (!fp.startsWith(PUBLIC)) return sendErr(res, 403, 'forbidden');
  if (pathname === '/' || pathname === '') fp = path.join(PUBLIC, 'index.html');
  fs.stat(fp, (err, st) => {
    if (!err && st.isDirectory()) fp = path.join(fp, 'index.html');
    fs.readFile(fp, (err2, data) => {
      if (err2) return sendErr(res, 404, 'Not found');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store, must-revalidate',
      });
      res.end(data);
    });
  });
}

// ---------- router ----------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  // health
  if (p === '/health') return sendJSON(res, 200, { status: 'ok', upstream: 'asiabox', uptime: process.uptime(), ts: Date.now() });

  // static files
  if (!p.startsWith('/api/')) return serveStatic(req, res, p === '/' ? '/' : p);

  // AsiaBox / Narto Index
  if (p === '/api/asiabox/index' || p === '/api/narto/index') {
    const page = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10) || 1);
    const provider = u.searchParams.get('provider') || 'all';
    const cacheKey = `${provider}:${page}`;
    const cached = asiaboxIndexCache.get(cacheKey);

    if (cached) {
      if (Date.now() - cached.ts >= INDEX_CACHE_TTL) {
        asiaboxFetchIndex(page, provider)
          .then((data) => asiaboxIndexCache.set(cacheKey, { data, ts: Date.now() }))
          .catch((e) => console.warn('[asiabox index] bg refresh failed:', e.message));
      }
      return sendJSON(res, 200, cached.data);
    }

    asiaboxFetchIndex(page, provider)
      .then((data) => {
        asiaboxIndexCache.set(cacheKey, { data, ts: Date.now() });
        sendJSON(res, 200, data);
      })
      .catch((err) => sendJSON(res, 200, { ok: false, message: err.message || 'Gagal memuat katalog', code: 'FETCH_ERROR' }));
    return;
  }

  // AsiaBox / Narto Search
  if (p === '/api/asiabox/search' || p === '/api/search') {
    const q = u.searchParams.get('q') || '';
    asiaboxSearch(q)
      .then((data) => sendJSON(res, 200, data))
      .catch((err) => sendJSON(res, 200, { ok: false, message: err.message, items: [], total: 0 }));
    return;
  }

  // AsiaBox VTT Subtitle Proxy (CORS bypass for ArtPlayer)
  if (p === '/api/asiabox/vtt' || p === '/api/vtt') {
    const targetUrl = u.searchParams.get('url');
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return sendErr(res, 400, 'Missing or invalid VTT url');
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    fetch(targetUrl, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
      .then(async (up) => {
        clearTimeout(t);
        if (!up.ok) return sendErr(res, up.status, 'Upstream VTT ' + up.status);
        const vttText = await up.text();
        res.writeHead(200, {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=43200',
        });
        res.end(vttText);
      })
      .catch((err) => {
        clearTimeout(t);
        sendErr(res, 502, err.message);
      });
    return;
  }

  // AsiaBox / Narto Detail
  if (p.startsWith('/api/asiabox/detail/') || p.startsWith('/api/narto/detail/')) {
    const parts = p.split('/').filter(Boolean);
    const slug = parts[3] || '';
    asiaboxFetchMovieDetail(slug)
      .then((data) => sendJSON(res, 200, data))
      .catch((err) => sendJSON(res, 200, { ok: false, message: err.message }));
    return;
  }

  // AsiaBox / Narto Watch
  if (p.startsWith('/api/asiabox/watch/') || p.startsWith('/api/narto/watch/')) {
    const parts = p.split('/').filter(Boolean);
    const slug = parts[3] || '';
    const ep = parts[4] || '1';
    const epN = parseInt(ep, 10) || 1;

    asiaboxResolveWatch(slug, epN)
      .then((out) => {
        if (!out || !out.ok) {
          return sendJSON(res, 200, { ok: false, message: out?.message || 'Stream tidak tersedia', code: 'NO_STREAM' });
        }
        sendJSON(res, 200, out);
      })
      .catch((err) => sendJSON(res, 200, { ok: false, message: err.message || 'Gagal memuat video', code: 'RESOLVE_ERROR' }));
    return;
  }

  sendErr(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`Iskan Drama SPA running at http://localhost:${PORT}`);
  console.log(`Primary upstream: AsiaBox Drama (${TARGET_API})`);
  // Pre-warm index page 1
  asiaboxFetchIndex(1, 'all')
    .then(() => console.log('[prewarm] AsiaBox home (Popular & Terbaru) cached.'))
    .catch((e) => console.log('[prewarm] non-fatal:', e.message));
});

module.exports = server;
