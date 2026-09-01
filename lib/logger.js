/**
 * logger — minimal console logger dengan level & timestamp.
 */
const LEVELS = ['debug', 'info', 'warn', 'error'];
const ACTIVE = process.env.LOG_LEVEL || 'info';

function ts() {
  return new Date().toISOString();
}

function emit(level, ...args) {
  if (LEVELS.indexOf(level) >= LEVELS.indexOf(ACTIVE)) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](`[${ts()}] [${level.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  debug: (...a) => emit('debug', ...a),
  info: (...a) => emit('info', ...a),
  warn: (...a) => emit('warn', ...a),
  error: (...a) => emit('error', ...a),
};
