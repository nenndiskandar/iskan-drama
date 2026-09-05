require('dotenv').config();
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3003;
const TARGET_API = process.env.TARGET_API || 'https://edge.narto-drama.com';
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '45000', 10);

app.use(express.json({ limit: '1mb' }));

// ------------------------------------------------------------------
// Static SPA
// ------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  // Static app files must never be cached (Cloudflare proxy set a ~15h
  // max-age which served stale JS/CSS to mobile). Force revalidation.
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, must-revalidate');
  },
}));

// ------------------------------------------------------------------
// Raw pass-through proxy — NO relay, NO transform, NO cache.
// /api/raw/<path>?<query>  ->  TARGET_API/<path>?<query>
// ------------------------------------------------------------------
// Branding strip: hapus semua teks terkait "narto drama" (termasuk
// domain di URL) dari payload response secara rekursif.
const BRAND_URL_RE = /https?:\/\/narto[\s-]*drama\.com/gi;
const BRAND_TEXT_RE = /narto[\s-]*drama/gi;

function stripBranding(v) {
  if (typeof v === 'string') {
    return v.replace(BRAND_URL_RE, '').replace(BRAND_TEXT_RE, '');
  }
  if (Array.isArray(v)) return v.map(stripBranding);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = stripBranding(v[k]);
    return out;
  }
  return v;
}

app.use('/api/raw', async (req, res) => {
  const targetPath = req.originalUrl.replace('/api/raw', '');
  const targetUrl = TARGET_API + targetPath;
  try {
    const upstream = await axios.request({
      method: req.method || 'GET',
      url: targetUrl,
      timeout: TIMEOUT_MS,
      responseType: 'json',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    res.set('Cache-Control', 'no-cache');
    res.status(upstream.status).json(stripBranding(upstream.data));
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({ status: 'error', message: err.message || 'Upstream error' });
  }
});

// ------------------------------------------------------------------
// Stream resolver — extract real HLS .m3u8 URL from the watch page.
// The m3u8 lives in the page HTML; stream CDN allows CORS *, so the
// browser can play it directly via hls.js (no iframe, no ads gate).
//
// Strategy: fetch /search/import to resolve slug → fetch the specific
// episode page → extract initialSourceUrl (the m3u8 stream URL).
// ------------------------------------------------------------------
var slugCache = {};

app.get('/api/stream/:bookId', async (req, res) => {
  const { bookId } = req.params;
  let { ep = '1', provider = '', title = '', lang = 'id-ID' } = req.query;
  const cacheKey = provider + ':' + bookId + ':' + title;
  const timeout = 45000;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

  try {
    // Step 1: resolve slug (if not cached). Upstream /search/import needs a real
    // provider (all sections items use 'bibishort'); the SPA sends category-based
    // provider which is often empty -> 404. Fall back to /detail/<id> 301 (new-id
    // format, e.g. 127217) when import fails.
    if (!slugCache[cacheKey]) {
      // Derive upstream provider from book_id pattern (heuristic, from live sections:
      // bibishort IDs are small ~159-413, shortmax ~6-digit 480k-863k, dramabox are
      // large 8-11 digit 4.1e9-4.2e9). Falls back to 'bibishort' for unknown ranges.
      var importProvider = provider;
      if (!importProvider) {
        var nid = parseInt(bookId, 10);
        if (!isNaN(nid)) {
          if (nid >= 4000000000) importProvider = 'dramabox';      // 41000123456-42000026344
          else if (nid >= 15000000) importProvider = 'vigloo';     // 15002942 (8-digit)
          else if (nid >= 400000) importProvider = 'shortmax';     // 481561-863312
          else importProvider = 'bibishort';                        // 159-413
        } else {
          importProvider = 'bibishort';
        }
      }
      const importUrl = TARGET_API + '/search/import?provider=' + encodeURIComponent(importProvider) +
        '&book_id=' + encodeURIComponent(bookId) +
        '&title=' + encodeURIComponent(title) +
        '&lang=' + encodeURIComponent(lang) +
        '&target_lang=' + encodeURIComponent(lang) +
        '&from=search';
      try {
        const r1 = await axios.get(importUrl, {
          timeout: timeout, maxRedirects: 5, responseType: 'text',
          headers: { 'User-Agent': ua, 'Accept-Language': lang + ',' + lang.slice(0, 2) + ';q=0.9' }
        });
        var finalUrl = r1.request.res.responseUrl;
        var slugMatch = finalUrl.match(/\/detail\/watch\/([^/?#]+)/);
        slugCache[cacheKey] = slugMatch ? slugMatch[1] : '';
      } catch (impErr) {
        // fallback: /detail/<id> 301-redirect (works for new-id format)
        const redResp = await axios.get(TARGET_API + '/detail/' + encodeURIComponent(bookId), {
          timeout: timeout, maxRedirects: 0, validateStatus: () => true,
          headers: { 'User-Agent': ua, 'Accept-Language': lang + ',' + lang.slice(0, 2) + ';q=0.9' }
        });
        const loc = redResp.headers && redResp.headers.location;
        const redSlug = loc ? String(loc).match(/\/detail\/watch\/([^/?#]+)/) : null;
        slugCache[cacheKey] = redSlug ? redSlug[1] : '';
      }
    }

    var slug = slugCache[cacheKey];
    if (!slug) return res.status(404).json({ ok: false, message: 'Could not resolve slug' });

    // Step 2: fetch the specific episode page
    var watchUrl = TARGET_API + '/detail/watch/' + slug + '/' + ep + '?lang=' + encodeURIComponent(lang) + '&from=search';
    if (ep === '' || ep === '0') { watchUrl = TARGET_API + '/detail/watch/' + slug + '?lang=' + encodeURIComponent(lang) + '&from=search'; }

    var r2 = await axios.get(watchUrl, {
      timeout: timeout, maxRedirects: 3, responseType: 'text',
      headers: { 'User-Agent': ua, 'Accept-Language': lang + ',' + lang.slice(0, 2) + ';q=0.9' }
    });
    var html = r2.data;
    var decoded = null;
    function decodeStream(u) {
      return String(u).replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/\u0026/g, '&');
    }
    // Format A: initialSourceUrl = "...<m3u8>"
    var srcMatch = html.match(/initialSourceUrl\s*=\s*["']([^"']+)["']/);
    if (srcMatch) decoded = srcMatch[1];
    // Format B: episodeItemsRaw = [{...,"multi_resolutions":[{"stream_url":"..."}]}]
    if (!decoded) {
      var erMatch = html.match(/episodeItemsRaw\s*=\s*(\[[\s\S]*?\]);\s*$/m);
      if (erMatch) {
        try {
          var parsed = JSON.parse(erMatch[1]);
          var first = parsed && parsed[0];
          var mrs = first && first.multi_resolutions;
          if (mrs && mrs.length) {
            var def = mrs.find(function (m) { return m.is_default; }) || mrs[0];
            if (def && def.stream_url) decoded = def.stream_url;
          }
        } catch (e) { decoded = null; }
      }
    }
    if (!decoded) return res.status(404).json({ ok: false, message: 'Stream not found in page', slug: slug, watchUrl: watchUrl });

    // Total episodes: look for "Episode ... dari X" or "dari (\\d+)"
    var epMatch = html.match(/dari\s*(\d+)/i);
    var total_eps = epMatch ? parseInt(epMatch[1], 10) : null;

    var url = decodeStream(decoded);
    res.json({ ok: true, url: url, book_id: bookId, ep: parseInt(ep, 10) || 1, total_eps: total_eps, slug: slug });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'Failed to resolve stream', code: err.code || '' });
  }
});

// ------------------------------------------------------------------
// DramaboxDB stream resolver — dramaboxdb.com aggregator.
//   GET /api/stream/dc/:bookId/:ep?title=<slug>
// Detail page https://www.dramaboxdb.com/in/movie/<bookId>/<slug> embeds
// pre-signed m3u8 (hwzthls.dramaboxdb.com, no auth/referer needed).
// Robust server-side: no CF throttle. Returns m3u8 + 540/720/1080p renditions.
// ------------------------------------------------------------------
const DC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

app.get('/api/stream/dc/:bookId/:ep', async (req, res) => {
  const { bookId, ep } = req.params;
  const slug = String(req.query.title || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return res.status(400).json({ ok: false, message: 'Missing title slug' });
  const detailUrl = `https://www.dramaboxdb.com/in/movie/${encodeURIComponent(bookId)}/${encodeURIComponent(slug)}`;
  try {
    const r = await axios.get(detailUrl, {
      timeout: 25000, maxRedirects: 3, responseType: 'text',
      headers: { 'User-Agent': DC_UA, 'Accept-Language': 'id-ID,id;q=0.9' },
    });
    const next = parseNextData(r.data);
    if (!next) return res.status(502).json({ ok: false, message: 'No Next.js data block on detail page', detailUrl: detailUrl });
    const p = (next.props && next.props.pageProps) || {};
    const bookInfo = p.bookInfo || {};
    const chapters = (p.chapterList || []);
    // chapterNumber is 1-based; ep is 1-based. Chapters are sorted ascending by index.
    const epIdx = (parseInt(ep, 10) || 1) - 1;
    const total_eps = parseInt(bookInfo.chapterCount || chapters.length || 0, 10);
    const poster = bookInfo.cover || '';
    // Build a stream entry per chapter (each has its own pre-signed m3u8).
    const streams = chapters.map(function (c) {
      const u = c.m3u8Url || c.mp4 || '';
      return { ep: parseInt(c.indexStr, 10) || (c.index + 1), quality: '720p', url: u, ext: u && u.toLowerCase().indexOf('.mp4') >= 0 ? 'mp4' : 'm3u8' };
    }).filter(function (s) { return !!s.url; });
    // Pick m3u8 for this episode. If missing, fall back to first mp4/m3u8 on page.
    let m3u8 = '';
    if (chapters[epIdx] && (chapters[epIdx].m3u8Url || chapters[epIdx].mp4)) {
      m3u8 = chapters[epIdx].m3u8Url || chapters[epIdx].mp4;
    }
    if (!m3u8) {
      // fallback: regex scan the raw HTML for the first m3u8/mp4
      const html = r.data; const re = /https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*/g; let mt;
      while ((mt = re.exec(html))) { const u = mt[0].replace(/\\u002[Ff]/g, '/').replace(/\\u0026/g, '&'); if (u) { m3u8 = u; break; } }
    }
    if (!m3u8) return res.status(404).json({ ok: false, message: 'No stream URL found in detail page', detailUrl: detailUrl });
    const cleaned = m3u8.replace(/\\\\u002F/g, '/').replace(/\\\\u0026/g, '&');
        const ext = cleaned.toLowerCase().indexOf('.mp4') >= 0 ? 'mp4' : 'm3u8';
        const synopsis = bookInfo.introduction || '';
        res.json({
          ok: true, url: cleaned, m3u8: cleaned,
          detail_url: detailUrl, ep: parseInt(ep, 10) || 1,
          total_eps: total_eps, poster: poster, cover: poster,
          episodes: total_eps || streams.length, episode_list: streams, streams: streams,
          ext: ext, lang: bookInfo.simpleLanguage || 'id', synopsis: synopsis,
        });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'DramaboxDB resolve failed', code: err.code || '' });
  }
});

// Parse Next.js __NEXT_DATA__ block (HTML-escaped JSON) into an object.
function parseNextData(html) {
  const block = (typeof html === 'string') ? html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/) : null;
  if (!block) return null;
  try {
    let raw = block[1];
    raw = raw.replace(/"/g, '"').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&/g, '&');
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// ------------------------------------------------------------------
// DramaboxDB homepage scraper — returns a sections-shaped payload the
// frontend reuses for the grid. Scrapes https://www.dramaboxdb.com/ for
// /movie/<bookId>/<slug> links.
//   GET /api/dc/home?page=
// ------------------------------------------------------------------
const DC_PROVIDERS = { dramabox: 'DramaBox' };

app.get('/api/dc/home', async (req, res) => {
  const page = parseInt(req.query.page || '1', 10) || 1;
  try {
    const r = await axios.get('https://www.dramaboxdb.com/in/', {
      timeout: 25000, responseType: 'text', maxRedirects: 3,
      headers: { 'User-Agent': DC_UA, 'Accept-Language': 'id-ID,id;q=0.9' },
    });
    const html = r.data;
    // Scrape /in/movie/<bookId>/<slug> hrefs from Indonesian homepage SSR.
    const movies = [];
    const re = /href="(\/in\/movie\/(\d+)\/([a-z0-9-]+))"/g;
    let m; const seen = {};
    while ((m = re.exec(html))) {
      const key = m[2] + ':' + m[3];
      if (seen[key]) continue;
      seen[key] = 1;
      movies.push({ id: m[2], slug: m[3] });
    }
    // Parallel-fetch each detail page's __NEXT_DATA__ for cover + chapterCount + Indonesian title.
    // dramaboxdb /in/ is CF-clean; fetches are fast (~0.2s for 12 items).
    await Promise.all(movies.map(async (mo) => {
      const url = 'https://www.dramaboxdb.com/in/movie/' + encodeURIComponent(mo.id) + '/' + encodeURIComponent(mo.slug);
      try {
        const d = await axios.get(url, { timeout: 20000, maxRedirects: 3, responseType: 'text', headers: { 'User-Agent': DC_UA } });
        const next = parseNextData(d.data);
        const bi = (next && next.props && next.props.pageProps && next.props.pageProps.bookInfo) || {};
        if (bi.cover) mo.cover = bi.cover;
        if (bi.chapterCount) mo.total_eps = parseInt(bi.chapterCount, 10);
        if (bi.bookName) mo.title_id = bi.bookName;
        if (bi.introduction) mo.synopsis = bi.introduction;
      } catch (e) { /* ignore missing cover; fallback handled in frontend */ }
    }));
    const items = movies.map(function (mo) {
      // Prefer the Indonesian title (bookName) from detail; fallback to slug-derived.
      var titleDisplay = mo.title_id || mo.slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return Object.assign({}, mo, {
        id: mo.id, book_id: mo.id, slug: mo.slug, code: 'dramabox', provider: 'DramaBox',
        title: titleDisplay, title_id: mo.title_id || '',
        poster: mo.cover || '',
        total_eps: mo.total_eps || 0,
        synopsis: mo.synopsis || '',
        watch_url: '/api/stream/dc/' + encodeURIComponent(mo.id) + '/1?title=' + encodeURIComponent(mo.slug),
        external_url: 'https://www.dramaboxdb.com/in/movie/' + encodeURIComponent(mo.id) + '/' + encodeURIComponent(mo.slug),
      });
    });
    res.json({
      ok: true,
      providers: Object.keys(DC_PROVIDERS).map(function (k) { return { key: k, label: DC_PROVIDERS[k] }; }),
      sections: [{ tab_key: 'for-you', tab_label: 'DramaBox Indonesia', items: items }],
      page: page,
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'DramaboxDB home failed', code: err.code || '' });
  }
});

// M3U8 proxy — fetch video manifest/segments through the server with a
// browser User-Agent + referer so CDN hotlink/referer checks pass. Query:
//   /api/proxy/m3u8?url=<encoded>
// Segments referenced in the playlist are rewritten to also go through this
// proxy so every fetch keeps the browser headers.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

app.get('/api/proxy/m3u8', async (req, res) => {
  const target = String(req.query.url || '');
  if (!target || !/^https?:\/\//.test(target)) {
    return res.status(400).json({ ok: false, message: 'Missing url' });
  }
  try {
    const tgt = new URL(target);
    // dramaboxdb signed m3u8/segment needs Referer = parent site origin, not the CDN origin.
    const referer = /dramaboxdb\.com$/.test(tgt.hostname.replace(/^www\./, '')) || tgt.hostname === 'hwzthls.dramaboxdb.com' ? 'https://www.dramaboxdb.com/' : (tgt.origin + '/');
    const upstream = await axios.request({
      method: 'GET', url: target, timeout: 30000, responseType: 'stream',
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': referer,
        'Origin': 'https://www.dramaboxdb.com',
        'Accept': '*/*',
      },
    });
    res.set('Content-Type', upstream.headers['content-type'] || 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');
    // Rewrite absolute segment URLs so children also pass through the proxy.
    let body = '';
    upstream.data.on('data', (c) => { body += c; });
    upstream.data.on('end', () => {
      const base = target.split('/').slice(0, -1).join('/') + '/';
      const rewritten = body.replace(/^(.+)$/gm, (line) => {
        const t = line.trim();
        if (!t || t.startsWith('#') || /^(http|https):\/\//.test(t)) return line;
        return '/api/proxy/m3u8?url=' + encodeURIComponent(new URL(t, base).toString());
      });
      res.send(rewritten);
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'proxy error', code: err.code || '' });
  }
});

// ------------------------------------------------------------------
// Narto BibiShort (edge) scraper — SSR index → sections-shaped payload.
//   GET /api/narto/index?page=1   ->  { providers, sections:[{items:[...]}] }
//   GET /api/narto/watch/:bookId/:ep?title=<slug>  ->  { ok, url, ... }
// ------------------------------------------------------------------
const NARTO_BASE = process.env.TARGET_API || 'https://edge.narto-drama.com';
// The SSR index is served from narto-drama.com while API/CDN resolves to
// an edge host. Follow redirects and use the returned final URL for strips.
// Note: some items (e.g. TikTok CDN short drama) use play_url as source.
const NARTO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const NARTO_AH = {
  'User-Agent': NARTO_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9',
};

// Parse a <article class="card" ...> block from SSR HTML.
function stripNartoTag(s) { return String(s).replace(/<\/?[^>]+(>|$)/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }

function nartoParseItems(html) {
  const out = [];
  const re = /<article[^>]*data-watch-url="([^"]+)"[^>]*>[\s\S]*?<\/article>/g;
  let m; const seen = {};
  while ((m = re.exec(html))) {
    const block = m[0];
    let url = m[1];
    const mid = (block.match(/data-movie-id="([^"]+)"/) || [])[1] || '';
    const poster = (block.match(/<img[^>]*src="([^"]+)"/) || [])[1] || '';
    const rawTitle = (block.match(/data-movie-title="([^"]+)"/) || [])[1] || '';
    const epMatch = (block.match(/class="episode-badge">\s*Ep:\s*(\d+)/i) || []);
    const tags = Array.from(block.matchAll(/class="movie-tag[^"]*"[^>]*>\s*#([^<]+)\s*</g)).map((x) => stripNartoTag(x[1]));
    const slug = String(url).split('/detail/watch/')[1] ? String(url).split('/detail/watch/')[1].split('?')[0] : String(url).split('/').filter(Boolean).pop() || '';
    const key = slug || mid;
    if (!key || seen[key]) continue;
    seen[key] = 1;
    out.push({
      id: mid || slug, book_id: mid || slug, slug: slug, code: 'bibishort', provider: 'BibiShort',
      title: stripNartoTag(rawTitle),
      poster: (poster && /^https?:/i.test(poster)) ? poster : (poster ? NARTO_BASE + poster : ''),
      total_eps: epMatch[1] ? parseInt(epMatch[1], 10) : null,
      tags: tags.slice(0, 3),
      watch_url: '/api/narto/watch/' + encodeURIComponent(mid || slug) + '/1?title=' + encodeURIComponent(slug),
      external_url: String(url).replace(/&amp;/g, '&'),
    });
  }
  return out;
}

app.get('/api/narto/index', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  try {
    const url = NARTO_BASE + '/?lang=id-ID&tab-provider=bibishort' + (page > 1 ? '&page=' + page : '');
    const r = await axios.get(url, { timeout: 25000, maxRedirects: 5, responseType: 'text', headers: NARTO_AH });
    const items = nartoParseItems(r.data);
    res.json({
      ok: true,
      providers: [{ key: 'bibishort', label: 'BibiShort' }],
      sections: [{ tab_key: 'for-you', tab_label: page === 1 ? 'BibiShort Indonesia' : 'BibiShort Indonesia (hal. ' + page + ')', page: page, items: items }],
      page: page,
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'Narto index failed', code: err.code || '' });
  }
});

// Parse a (possibly escaped) inline JSON array from the watch page. Returns { items, movieId, sourceApp }.
function nartoParseWatchState(html) {
  const startIdx = html.indexOf('const episodeItemsRaw = [');
  if (startIdx < 0) return null;
  const start = html.indexOf('[', startIdx);
  let depth = 0;
  let end = -1;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) return null;
  const raw = html.slice(start, end)
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/g, '/')
    .replace(/\\u002[fF]/g, '/');
  try {
    const items = JSON.parse(raw);
    const movieId = (html.match(/const movieId = (\d+)/) || [])[1] || '';
    const sourceApp = (html.match(/const movieSourceAppName = "([^"]+)"/) || [])[1] || '';
    return { items: items, movieId: movieId, sourceApp: sourceApp };
  } catch (e) { return null; }
}

app.get('/api/narto/watch/:bookId/:ep', async (req, res) => {
  const { bookId, ep } = req.params;
  let title = String(req.query.title || '');
  const epN = (parseInt(ep, 10) || 1);
  try {
    const pageUrl = NARTO_BASE + '/detail/watch/' + encodeURIComponent(title || bookId) + '/' + epN + '?lang=id-ID&from=search';
    const r = await axios.get(pageUrl, { timeout: 25000, maxRedirects: 5, responseType: 'text', headers: NARTO_AH });
    const state = nartoParseWatchState(r.data);
    if (!state) return res.status(502).json({ ok: false, message: 'No watch state parsed', url: pageUrl });
        const idx = state.items.findIndex((it) => Number(it.route_episode_number) === epN);
            const epObj = idx >= 0 ? state.items[idx] : state.items[0];
            const url = String(epObj.direct_play_url || epObj.play_url || '').trim();
            if (!url) return res.status(404).json({ ok: false, message: 'No stream for ep ' + epN });
            // TikTok-hosted sources are direct MP4 (mime_type=video_mp4 in the query) playable
            // natively in <video> — NOT HLS. Detect the real container instead of relying on '.mp4'.
            const lowerUrl = url.toLowerCase();
            const isTiktokMp4 = /tiktokcdn\.com/i.test(url) && /mime_type=video_mp4/i.test(url);
            const ext = (lowerUrl.indexOf('.m3u8') >= 0 && !isTiktokMp4) ? 'm3u8' : 'mp4';
            // rebuilt playlists / .ts segments are relative to the cdn host
            res.json({
              ok: true, url: url, book_id: state.movieId || bookId,
              ep: epN, total_eps: state.items.length,
              movie_id: state.movieId, source_app: state.sourceApp,
              episodes: state.items.length,
              ext: ext,
              episode_list: state.items.map((it) => ({
                ep: Number(it.route_episode_number),
                quality: '720p',
                url: String(it.direct_play_url || it.play_url || '').trim(),
                ext: (String(it.direct_play_url || it.play_url || '').toLowerCase().indexOf('.mp4') >= 0) ? 'mp4' : 'm3u8',
              })),
            });
          } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'Narto watch failed', code: err.code || '' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// 404 for anything not handled (SPA hash routing lives client-side)
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Iskan Drama SPA running at http://localhost:${PORT}`);
  console.log(`Raw proxy target: ${TARGET_API} (via /api/raw/*)`);
});

module.exports = app;
