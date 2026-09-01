const express = require('express');
const apiRelay = require('../services/apiRelay');
const logger = require('../lib/logger');

const router = express.Router();

/**
 * Halaman utama — grid list drama.
 * Mengambil data via apiRelay (server-side), lalu render ke EJS.
 * Query params: ?page=N&provider=KEY
 */
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const provider = req.query.provider || '';
  const lang = req.query.lang || 'en-US';

  try {
    const data = await apiRelay.getHome({ provider, page, lang });
    // Get providers list for the filter dropdown
    const providersResp = await apiRelay.getProviders(lang);

    res.render('pages/index', {
      title: 'Narto Drama - Watch Short Dramas Free',
      movies: data.movies,
      sections: data.sections,
      providers: providersResp.providers,
      activeProvider: data.active_provider || provider,
      providerLabel:
        providersResp.providers.find((p) => p.value === provider)?.label || 'All Providers',
      pagination: data.pagination,
      currentPage: page,
      lang,
    });
  } catch (err) {
    logger.error('Index page error', err.message);
    res.status(502).render('pages/error', {
      title: 'Error',
      message: 'Failed to load drama list. Please try again later.',
    });
  }
});

/**
 * Halaman detail drama.
 * /detail/watch/:slug — fetch detail via apiRelay.getMovie
 */
router.get('/detail/watch/:slug', async (req, res) => {
  const slug = req.params.slug;
  const lang = req.query.lang || 'en-US';

  try {
    const { movie } = await apiRelay.getMovie(slug, '', lang);
    if (!movie) {
      return res.status(404).render('pages/404', { title: 'Drama Not Found' });
    }
    res.render('pages/detail', {
      title: `${movie.title} - Narto Drama`,
      movie,
      lang,
    });
  } catch (err) {
    logger.error('Detail page error', slug, err.message);
    res.status(502).render('pages/error', {
      title: 'Error',
      message: 'Failed to load drama details.',
    });
  }
});

/**
 * Halaman nonton — player video.
 * Note: This project is a frontend index only; video playback relies on
 * the upstream provider's player. We render a placeholder iframe shell.
 */
router.get('/watch/:slug', async (req, res) => {
  const slug = req.params.slug;
  const lang = req.query.lang || 'en-US';

  try {
    const { movie } = await apiRelay.getMovie(slug, '', lang);
    if (!movie) {
      return res.status(404).render('pages/404', { title: 'Video Not Found' });
    }
    // Generate episode list based on detected episode count (or default range)
    const epCount = movie.episodes || 1;
    const episodes = Array.from({ length: epCount }, (_, i) => ({
      ep: i + 1,
      url: `/watch/${slug}?ep=${i + 1}`,
    }));

    res.render('pages/watch', {
      title: `${movie.title} - Watch Online`,
      movie,
      episodes,
      currentEp: parseInt(req.query.ep, 10) || 1,
      lang,
    });
  } catch (err) {
    logger.error('Watch page error', slug, err.message);
    res.status(502).render('pages/error', {
      title: 'Error',
      message: 'Failed to load player.',
    });
  }
});

/**
 * Halaman kategori — provider filter.
 * /provider/:key — list dramas filtered by provider
 */
router.get('/provider/:key', async (req, res) => {
  const key = req.params.key;
  const page = parseInt(req.query.page, 10) || 1;
  const lang = req.query.lang || 'en-US';

  try {
    const data = await apiRelay.getCategory(key, { page, lang });
    const providersResp = await apiRelay.getProviders(lang);

    res.render('pages/index', {
      title: `${providersResp.providers.find((p) => p.value === key)?.label || key} - Narto Drama`,
      movies: data.movies,
      sections: data.sections,
      providers: providersResp.providers,
      activeProvider: key,
      providerLabel:
        providersResp.providers.find((p) => p.value === key)?.label || key,
      pagination: data.pagination,
      currentPage: page,
      lang,
    });
  } catch (err) {
    logger.error('Provider page error', key, err.message);
    res.status(502).render('pages/error', {
      title: 'Error',
      message: 'Failed to load provider content.',
    });
  }
});

module.exports = router;
