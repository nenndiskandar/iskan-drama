require('dotenv').config();
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3003;
const TARGET_API = process.env.TARGET_API || 'https://narto-drama.com';
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '15000', 10);

app.use(express.json({ limit: '1mb' }));

// ------------------------------------------------------------------
// Static SPA
// ------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

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
  const timeout = 20000;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

  try {
    // Step 1: resolve slug (if not cached)
    if (!slugCache[cacheKey]) {
      const importUrl = TARGET_API + '/search/import?provider=' + encodeURIComponent(provider) +
        '&book_id=' + encodeURIComponent(bookId) +
        '&title=' + encodeURIComponent(title) +
        '&lang=' + encodeURIComponent(lang) +
        '&target_lang=' + encodeURIComponent(lang) +
        '&from=search';
      const r1 = await axios.get(importUrl, {
        timeout: timeout, maxRedirects: 5, responseType: 'text',
        headers: { 'User-Agent': ua, 'Accept-Language': lang + ',' + lang.slice(0, 2) + ';q=0.9' }
      });
      var finalUrl = r1.request.res.responseUrl;
      var slugMatch = finalUrl.match(/\/detail\/watch\/([^/?#]+)/);
      slugCache[cacheKey] = slugMatch ? slugMatch[1] : '';
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
    var srcMatch = html.match(/initialSourceUrl\s*=\s*["']([^"']+)["']/);
    if (!srcMatch) return res.status(404).json({ ok: false, message: 'Stream not found in page', slug: slug, watchUrl: watchUrl });

    // Total episodes: look for "Episode ... dari X" or "dari (\\d+)"
    var epMatch = html.match(/dari\s*(\d+)/i);
    var total_eps = epMatch ? parseInt(epMatch[1], 10) : null;

    var url = srcMatch[1].replace(/\\\//g, '/');
    res.json({ ok: true, url: url, book_id: bookId, ep: parseInt(ep, 10) || 1, total_eps: total_eps, slug: slug });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message || 'Failed to resolve stream', code: err.code || '' });
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
