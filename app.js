require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const expressLayouts = require('express-ejs-layouts');
const logger = require('./lib/logger');

const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3003;
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3003'];

// ------------------------------------------------------------------
// EJS + layouts setup
// ------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/layout');
app.use(expressLayouts);
app.set('layout extractStyles', true);
app.set('layout extractScripts', true);

// ------------------------------------------------------------------
// Global middleware
// ------------------------------------------------------------------
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Share common locals with every EJS view (so layout.ejs has `lang`, etc.)
app.use((req, res, next) => {
  const urlLang = req.query.lang || 'en-US';
  res.locals.lang = urlLang;
  res.locals.targetApi = process.env.TARGET_API || 'https://narto-drama.com';
  next();
});

// CORS — localhost only (development)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      logger.warn('Blocked CORS origin', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Static assets
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images'), { maxAge: '1d' }));

// Disable HTML layout for /api — return passthrough JSON
app.use('/api', (req, res, next) => {
  req.headers['x-no-layout'] = '1';
  next();
});

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.use('/', indexRoutes);
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// ------------------------------------------------------------------
// 404 + error handling
// ------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('pages/404', { title: '404 - Not Found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err.stack || err.message);
  if (req.path.startsWith('/api') || req.headers['x-no-layout'] === '1') {
    return res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
  }
  res.status(500).render('pages/error', { title: '500 - Error', message: err.message });
});

app.listen(PORT, () => {
  logger.info('Narto Drama server running at http://localhost:' + PORT);
  logger.info('API relay target: ' + process.env.TARGET_API);

  // Warm-up: pre-prime home cache in background so the first user request
  // doesn't eat the upstream 30s cold-start latency.
  const apiRelay = require('./services/apiRelay');
  apiRelay
    .getHome({ page: 1, lang: 'en-US' })
    .then(() => logger.info('Warm-up OK: home cache primed'))
    .catch((err) => logger.warn('Warm-up failed (non-fatal)', err.message));
});

module.exports = app;
