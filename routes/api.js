const express = require('express');
const apiRelay = require('../services/apiRelay');
const logger = require('../lib/logger');

const router = express.Router();

/**
 * API Relay layer — semua request eksternal lewat sini.
 * Frontend/browser TIDak boleh langsung hit narto-drama.com.
 */

/**
 * GET /api/home
 *   Query: ?page=N&provider=KEY&lang=en-US
 */
router.get('/home', async (req, res, next) => {
  const { page, provider, lang } = req.query;
  try {
    const data = await apiRelay.getHome({
      provider: provider || '',
      page: parseInt(page, 10) || 1,
      lang: lang || 'en-US',
    });
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/movie/:id
 *   id = book_id atau slug
 *   Query: ?provider=KEY&lang=en-US
 */
router.get('/movie/:id', async (req, res, next) => {
  const { id } = req.params;
  const { provider, lang } = req.query;
  try {
    const data = await apiRelay.getMovie(id, provider || '', lang || 'en-US');
    res.json({ status: 'success', data });
  } catch (err) {
    logger.error('API movie error', id, err.message);
    res.status(404).json({ status: 'error', message: 'Movie not found' });
  }
});

/**
 * GET /api/category/:cat
 *   cat = provider key atau "all"
 */
router.get('/category/:cat', async (req, res, next) => {
  const { cat } = req.params;
  const { page, lang } = req.query;
  try {
    const data = await apiRelay.getCategory(cat, {
      page: parseInt(page, 10) || 1,
      lang: lang || 'en-US',
    });
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tag/:tag
 *   tag = tag slug (e.g. "revenge", "counterattack")
 */
router.get('/tag/:tag', async (req, res, next) => {
  const { tag } = req.params;
  const { page, lang } = req.query;
  try {
    const data = await apiRelay.getTag(tag, {
      page: parseInt(page, 10) || 1,
      lang: lang || 'en-US',
    });
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/providers
 *   List semua provider yang tersedia
 */
router.get('/providers', async (req, res, next) => {
  const { lang } = req.query;
  try {
    const data = await apiRelay.getProviders(lang || 'en-US');
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/watch
 *   Body: { movieId, episode }
 *   Catat history lokal (stub — eksternal butuh login)
 */
router.post('/watch', async (req, res, next) => {
  const { movieId, episode } = req.body;
  if (!movieId) {
    return res.status(400).json({ status: 'error', message: 'movieId required' });
  }
  try {
    const result = await apiRelay.recordWatch(movieId, episode);
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
