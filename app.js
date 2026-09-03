require('dotenv').config();
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3003;
const TARGET_API = process.env.TARGET_API || 'https://narto-drama.com';
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
    const upstream = await axios.request({
      method: 'GET', url: target, timeout: 30000, responseType: 'stream',
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': target,
        'Origin': new URL(target).origin,
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
