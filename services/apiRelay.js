const axios = require('axios');
const logger = require('../lib/logger');
const { searchCache, homeCache } = require('../lib/cache');

const TARGET_API = process.env.TARGET_API || 'https://narto-drama.com';
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '15000', 10);

/**
 * apiRelay — server-side proxy ke narto-drama.com.
 * Frontend browser TIDak pernah langsung ke API eksternal; semua lewat route /api/.
 */
class ApiRelay {
  constructor() {
    this.client = axios.create({
      baseURL: TARGET_API,
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    this.client.interceptors.request.use((cfg) => {
      logger.debug('apiRelay REQ', cfg.method.toUpperCase(), cfg.url);
      return cfg;
    });
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.code === 'ECONNABORTED') {
          logger.error('apiRelay TIMEOUT to', err.config?.url);
          return Promise.reject(new Error('External API timed out'));
        }
        logger.error('apiRelay ERR', err.response?.status, err.message);
        return Promise.reject(err);
      }
    );
  }

  // =====================================================================
  // Internal transformers — convert external JSON schema → internal
  // =====================================================================

  /**
   * Retry a request fn with exponential backoff + tiny jitter.
   * Only retries on timeout / 5xx — passes through 4xx immediately.
   */
  async _withRetry(fn, { retries = 2, baseDelayMs = 400, label = '' } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = err.response?.status;
        const retryable = err.code === 'ECONNABORTED' || (status >= 500 && status < 600);
        if (!retryable || attempt === retries) break;
        const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 150);
        logger.warn(`apiRelay retry ${label || ''} attempt ${attempt + 1}/${retries} after ${delay}ms`, err.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Cached wrapper — returns cached value on hit, otherwise runs fn and stores.
   * Skipped when cache object is null. Gagal/Falsy tidak disimpan ke cache.
   */
  async _cached(cache, key, fn, ttlMs) {
    if (!cache) return fn();
    const hit = cache.get(key);
    if (hit !== undefined) {
      logger.debug('apiRelay CACHE HIT', key);
      return hit;
    }
    const value = await fn();
    if (value && value.movies && value.movies.length > 0) {
      cache.set(key, value, ttlMs);
    }
    return value;
  }

  /**
   * Resolve external relative URL → absolute narto URL.
   */
  _abs(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return TARGET_API + url;
  }

  /**
   * Transform external /home/providers/sections item → internal movie object.
   * External fields: book_id, title, description, poster_url, watch_url,
   *   category_name, is_adult, tag_names, episode_count (optional)
   */
  _toMovie(item, sectionTab) {
    const bookId = String(item.book_id || '');
    const slug = this._extractSlug(item);
    const id = bookId || slug || item.title;
    const poster = item.poster_url || '/images/fallback.png';
    // Provider's true watch URL (external)
    const externalWatch = this._abs(item.watch_url) || (slug ? `${TARGET_API}/detail/watch/${slug}` : '');

    return {
      id,
      book_id: bookId,
      title: item.title,
      slug,
      description: item.description || '',
      poster: poster,
      poster_url: this._abs(poster),
      tags: item.tag_names || [],
      category: item.category_name || '',
      episodes: typeof item.episode_count !== 'undefined' ? item.episode_count : null,
      source_type: item.source_type || '',
      // Local routes on our app
      detail_url: `/detail/watch/${id}`,
      watch_url: `/watch/${id}`,
      // Original narto link (opens upstream provider page)
      external_url: externalWatch,
      provider: item.category_name || sectionTab || '',
      is_adult: !!item.is_adult,
    };
  }

  /** Extract slug from external item.url or book_id. */
  _extractSlug(item) {
    const raw = item.url || item.watch_url || '';
    if (!raw) return '';
    const path = raw.split('?')[0].split('/').filter(Boolean);
    const afterWatch = path.indexOf('watch');
    return afterWatch >= 0 ? path[afterWatch + 1] : path[path.length - 1] || '';
  }

  /**
   * Transform external /search item → internal movie object.
   * External fields: id, title, description, poster_url, tags, url, source_type
   */
  _toMatchItem(item) {
    const id = String(item.id || '');
    const slug = this._extractSlug(item);
    const poster = item.poster_url || '/images/fallback.png';
    const externalUrl = this._abs(item.url) || (slug ? `${TARGET_API}/detail/watch/${slug}` : '');

    return {
      id,
      book_id: '',
      title: item.title,
      slug,
      description: item.description || '',
      poster: poster,
      poster_url: this._abs(poster),
      tags: item.tags || [],
      category: item.category_name || '',
      episodes: null,
      source_type: item.source_type || '',
      detail_url: `/detail/watch/${id}`,
      watch_url: `/watch/${id}`,
      external_url: externalUrl,
      provider: item.source_type || '',
      is_adult: false,
      full_search: true,
    };
  }

  /**
   * Transform external /home/providers/sections response → internal.
   */
  _fromSections(resp, page = 1) {
    const providers = (resp.providers || []).map((p) => ({
      value: p.key,
      label: p.label,
    }));
    const sections = (resp.sections || []).map((s) => ({
      tab_key: s.tab_key,
      tab_label: s.tab_label,
      page: s.page,
      has_prev: s.has_prev,
      items: (s.items || []).map((i) => this._toMovie(i, s.tab_label)),
    }));
    
    // Ambil items dari section utama 'for-you' jika ada, atau gabungkan semua
    const mainSection = sections.find(s => s.tab_key === 'for-you') || sections[0];
    const allMovies = sections.flatMap((s) => s.items);

    // Upstream memberikan page & has_prev di level section.
    // Default upstream limit per tab per request adalah sekitar 5-10 items.
    const hasPrev = mainSection ? !!mainSection.has_prev : page > 1;
    const hasNext = mainSection ? (mainSection.items.length >= 5) : false;

    // Total page di-estimate agar pagination UI render tombol Next & halaman-halaman selanjutnya
    const totalPages = hasNext ? page + 5 : page;

    return {
      movies: allMovies,
      providers,
      sections,
      active_provider: resp.active_provider,
      pagination: {
        current: page,
        total: totalPages,
        has_next: hasNext,
        has_prev: hasPrev,
        next: hasNext ? `?page=${page + 1}` : null,
        prev: hasPrev ? `?page=${page - 1}` : null,
      },
    };
  }

  // =====================================================================
  // Public methods — called by routes
  // =====================================================================

  /**
   * GET /api/home — fetch drama grid (paginated).
   */
  async getHome({ provider = '', page = 1, lang = 'en-US' } = {}) {
    const params = { lang };
    if (provider) params.provider = provider;
    // Paginate the active "for-you" tab when page>1
    if (page > 1) {
      params['tab_pages[for-you]'] = page;
    }

    const key = `home:${provider || 'all'}:${page}:${lang}`;
    logger.info('getHome', { provider, page, lang });
    const data = await this._cached(
      page === 1 ? homeCache : null,
      key,
      async () => {
        const res = await this._withRetry(() => this.client.get('/home/providers/sections', { params }), {
          label: 'getHome',
        });
        return this._fromSections(res.data, page);
      }
    );
    return data;
  }

  /**
   * GET /api/movie/:id — fetch detail for a single movie by book_id, slug, or id.
   * Tries per-provider sections first; falls back to /search.
   */
  async getMovie(id, provider = '', lang = 'en-US') {
    const bookIdStr = String(id || '');
    logger.info('getMovie', { id, provider });

    try {
      let found = null;

      // 1) Try the specified provider directly (match by book_id)
      if (provider) {
        const resp = await this.client.get('/home/providers/sections', {
          params: { lang, provider },
        });
        const s = this._findInSections(resp.data, bookIdStr);
        if (s) {
          found = s;
        }
      }

      // 2) Scan a few top providers for the book_id (no provider supplied)
      if (!found) {
        const resp = await this.client.get('/home/providers/sections', {
          params: { lang },
        });
        found = this._findInSections(resp.data, bookIdStr);
      }

      // 3) Fallback: search by slug/title fragment via /search?q=
      if (!found) {
        const q = encodeURIComponent(id);
        const skey = `search:${q}:${lang}`;
        const sres = await this._cached(searchCache, skey, async () => {
          return this._withRetry(
            () =>
              this.client.get('/search', {
                params: { q, limit: 5, lang },
              }),
            { retries: 3, baseDelayMs: 700, label: 'search' }
          );
        });
        if (sres.data.ok && sres.data.items?.length) {
          found = this._toMatchItem(sres.data.items[0]);
        }
      }

      if (!found) {
        const err = new Error(`Movie not found: ${id}`);
        err.status = 404;
        throw err;
      }

      return { movie: found };
    } catch (err) {
      if (err.status === 404) throw err;
      throw new Error(`Failed to fetch movie ${id}: ${err.message}`);
    }
  }

  /** Search sections for an item matching the given book_id string. */
  _findInSections(body, bookIdStr) {
    for (const s of body?.sections || []) {
      for (const i of s.items || []) {
        if (String(i.book_id) === bookIdStr || this._extractSlug(i) === bookIdStr) {
          return this._toMovie(i, s.tab_label);
        }
      }
    }
    return null;
  }

  /**
   * GET /api/category/:cat — list movies filtered by provider key.
   */
  async getCategory(cat = 'all', { page = 1, lang = 'en-US' } = {}) {
    logger.info('getCategory', { cat, page });
    if (cat === 'all') return this.getHome({ page, lang });

    const params = { lang };
    params.provider = cat;
    if (page > 1) {
      params['tab_pages[for-you]'] = page;
    }

    const res = await this.client.get('/home/providers/sections', { params });
    const data = this._fromSections(res.data, page);
    data.category = cat;
    return data;
  }

  /**
   * GET /api/tag/:tag — list movies by tag (uses /search?q=).
   */
  async getTag(tag, { page = 1, lang = 'en-US', limit = 28 } = {}) {
    logger.info('getTag', { tag, page });
    const q = encodeURIComponent(tag);
    const res = await this.client.get('/search', {
      params: { q, limit: String(limit), lang },
    });
    const items = (res.data.items || []).map((i) => this._toMatchItem(i));
    return {
      movies: items,
      tag: tag,
      pagination: {
        current: page,
        total: Math.max(1, Math.ceil(items.length / limit)),
        next: items.length === limit ? `/tag/${tag}?page=${page + 1}` : null,
        prev: page > 1 ? `/tag/${tag}?page=${page - 1}` : null,
      },
    };
  }

  /**
   * GET /api/providers — list all available content providers.
   */
  async getProviders(lang = 'en-US') {
    const res = await this.client.get('/home/providers/sections', {
      params: { lang },
    });
    return {
      providers: (res.data.providers || []).map((p) => ({
        value: p.key,
        label: p.label,
      })),
      active_provider: res.data.active_provider,
    };
  }

  /**
   * POST /api/watch — record watch history (local-only stub).
   */
  async recordWatch(movieId, episode) {
    logger.info('recordWatch (local-only)', { movieId, episode });
    return { recorded: true, movieId, episode };
  }
}

module.exports = new ApiRelay();
