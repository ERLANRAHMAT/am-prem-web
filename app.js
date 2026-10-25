'use strict';

const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');

const { securityHeaders, originGuard, botGuard, noIndexApi } = require('./middleware/security');
const { attachClient } = require('./middleware/guard');
const { ensureSession, saveSession } = require('./lib/session');
const { maskEmail, sendFail, logSafe } = require('./lib/errors');
const turnstile = require('./lib/turnstile');
const amRoutes = require('./routes/am');
const healthRoutes = require('./routes/health');
const pkg = require('./package.json');

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET wajib diisi minimal 32 karakter di production.');
  }

  if (!(process.env.BETABOTZ_AKSES_KEY || '').trim()) {
    console.warn('[config] BETABOTZ_AKSES_KEY belum diisi. Panggilan upstream akan gagal.');
  }

  if (!(process.env.SITE_URL || '').trim()) {
    console.warn('[config] SITE_URL belum diisi. Origin check memakai host request.');
  }

  const hasTurnstileSecret = Boolean((process.env.TURNSTILE_SECRET || '').trim());
  const hasTurnstileSiteKey = Boolean((process.env.TURNSTILE_SITE_KEY || '').trim());

  if (hasTurnstileSecret !== hasTurnstileSiteKey) {
    throw new Error('TURNSTILE_SITE_KEY dan TURNSTILE_SECRET harus diisi bersama.');
  }

  if (!turnstile.isEnabled()) {
    console.warn('[config] Cloudflare Turnstile nonaktif. Aktifkan untuk production.');
  }
}

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', isProduction);

function isMaintenance() {
  return String(process.env.MAINTENANCE).toLowerCase() === 'true';
}

function asset(file) {
  let target = String(file).replace(/^\/+/, '');

  if (isProduction && target.endsWith('.js')) {
    const minified = target.replace(/\.js$/, '.min.js');
    if (fs.existsSync(path.join(__dirname, 'public', minified))) {
      target = minified;
    }
  }

  return `/${target}?v=${pkg.version}`;
}

app.locals.asset = asset;
app.locals.siteName = 'Betabotz Studio';
app.locals.siteTitle = 'AM Generator';
app.locals.env = isProduction ? 'production' : 'development';
app.locals.year = new Date().getFullYear();
app.locals.appVersion = pkg.version;
app.locals.captchaEnabled = turnstile.isEnabled();

app.use(securityHeaders());

app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    dotfiles: 'ignore',
    etag: true,
    maxAge: isProduction ? '1h' : 0
  })
);

app.use(botGuard);
app.use(originGuard);
app.use(express.json({ limit: '4kb', strict: true }));
app.use(cookieParser());
app.use(attachClient);
app.use(noIndexApi);

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  next();
});

app.use((req, res, next) => {
  if (!isMaintenance()) return next();

  if (req.path === '/api/health') return next();

  if (req.path.startsWith('/api/')) {
    return sendFail(res, 503, 'Layanan sedang dalam perawatan. Coba lagi sebentar lagi.');
  }

  return renderStatusPage(res, 503, 'Sedang Dalam Perawatan', {
    page: 'maintenance',
    title: 'Sedang Dalam Perawatan',
    description: 'AM Generator sedang dalam perawatan. Silakan kembali lagi nanti.',
    statusCode: 503,
    message: 'Kami sedang melakukan perawatan singkat. Silakan muat ulang halaman beberapa saat lagi.'
  });
});

app.get('/', (req, res) => {
  const { session, isNew } = ensureSession(req);
  if (isNew) saveSession(res, session);

  res.set('Cache-Control', 'no-store, max-age=0');

  return res.render('index', {
    page: 'home',
    title: 'AM Generator - Aktivasi Premium Alight Motion',
    description:
      'Aktifkan premium Alight Motion lewat magic link dalam tiga langkah. Tanpa login, tanpa database, langsung dari browser.',
    boot: {
      step: session.step,
      email: session.email || '',
      emailMasked: session.email ? maskEmail(session.email) : '',
      hasToken: Boolean(session.token),
      canRetry: Boolean(session.token) && !session.result,
      result: session.result || null,
      lastError: session.lastError || '',
      captchaEnabled: turnstile.isEnabled(),
      turnstileSiteKey: turnstile.isEnabled() ? turnstile.getSiteKey() : '',
      env: isProduction ? 'production' : 'development'
    }
  });
});

app.get('/tutorial', (req, res) => {
  return res.render('tutorial', {
    page: 'tutorial',
    title: 'Tutorial - AM Generator',
    description: 'Panduan lengkap memakai AM Generator untuk aktivasi premium Alight Motion.'
  });
});

app.get('/privacy', (req, res) => {
  return res.render('privacy', {
    page: 'privacy',
    title: 'Syarat & Privasi - AM Generator',
    description: 'Syarat pemakaian dan kebijakan privasi AM Generator.'
  });
});

app.get('/terms', (req, res) => res.redirect(301, '/privacy'));

app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

app.use('/api/am', amRoutes);
app.use('/api/health', healthRoutes);

app.use('/api', (req, res) => {
  return sendFail(res, 404, 'Endpoint tidak ditemukan.');
});

app.use((req, res) => {
  return renderStatusPage(res, 404, 'Halaman Tidak Ditemukan', {
    page: 'not-found',
    title: 'Halaman Tidak Ditemukan',
    description: 'Halaman yang Anda cari tidak tersedia.',
    statusCode: 404,
    message: 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.'
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error && error.type === 'entity.too.large') {
    return sendFail(res, 413, 'Payload terlalu besar.');
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return sendFail(res, 400, 'Format JSON tidak valid.');
  }

  logSafe('server', (error && error.message) || 'unknown error');

  if (req.path.startsWith('/api/')) {
    return sendFail(res, 500, 'Terjadi kesalahan pada server. Coba lagi.');
  }

  return renderStatusPage(res, 500, 'Terjadi Kesalahan', {
    page: 'error',
    title: 'Terjadi Kesalahan',
    description: 'Terjadi kesalahan pada server.',
    statusCode: 500,
    message: 'Terjadi kesalahan pada server. Silakan muat ulang halaman.'
  });
});

function renderStatusPage(res, statusCode, title, locals) {
  res.status(statusCode);
  res.set('Cache-Control', 'no-store, max-age=0');
  return res.render('404', { ...locals, statusCode, title });
}

module.exports = app;
