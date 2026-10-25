'use strict';

const helmet = require('helmet');

const isProduction = process.env.NODE_ENV === 'production';

const BOT_UA_PATTERNS = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /axios\//i,
  /node-fetch/i,
  /undici/i,
  /go-http-client/i,
  /\bjava\//i,
  /okhttp/i,
  /libwww-perl/i,
  /scrapy/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i
];

function buildAllowedOrigins() {
  const origins = new Set();

  const add = (value) => {
    if (!value) return;
    const parts = String(value).split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // Abaikan nilai env yang tidak valid.
      }
    }
  };

  add(process.env.SITE_URL);
  add(process.env.ALLOWED_ORIGINS);

  if (process.env.VERCEL_URL) {
    add(`https://${process.env.VERCEL_URL}`);
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

function getClientIP(req) {
  const trustProxyHeaders = Boolean(process.env.VERCEL) || String(process.env.TRUST_PROXY).toLowerCase() === 'true';

  if (trustProxyHeaders) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
  }

  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

function isSameHostOrigin(req, origin) {
  const host = req.get('host');
  if (!host) return false;

  return origin === `https://${host}` || origin === `http://${host}`;
}

function securityHeaders() {
  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
    frameSrc: ['https://challenges.cloudflare.com'],
    objectSrc: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  };

  const siteUrl = (process.env.SITE_URL || '').trim().toLowerCase();
  const isHttpsSite = siteUrl.startsWith('https://') || Boolean(process.env.VERCEL);

  if (isProduction && isHttpsSite) {
    cspDirectives.upgradeInsecureRequests = [];
  }

  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      noSniff: true,
      hsts: isProduction
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
      hidePoweredBy: true
    }),
    (req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
      );
      next();
    }
  ];
}

function originGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');

  let candidate = origin;

  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      candidate = null;
    }
  }

  if (!candidate || candidate === 'null') {
    return res.status(403).json({
      ok: false,
      message: 'Permintaan ditolak. Origin tidak valid.'
    });
  }

  if (!allowedOrigins.has(candidate) && !isSameHostOrigin(req, candidate)) {
    return res.status(403).json({
      ok: false,
      message: 'Permintaan ditolak. Origin tidak valid.'
    });
  }

  return next();
}

function isStaticPath(pathname) {
  return (
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/') ||
    pathname.startsWith('/fonts/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  );
}

function botGuard(req, res, next) {
  if (isStaticPath(req.path)) return next();

  const userAgent = req.get('user-agent');

  if (!userAgent || !userAgent.trim()) {
    return rejectBot(req, res);
  }

  if (BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent))) {
    return rejectBot(req, res);
  }

  return next();
}

function rejectBot(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({
      ok: false,
      message: 'Permintaan ditolak.'
    });
  }

  return res.status(403).type('text/plain').send('Akses ditolak.');
}

function noIndexApi(req, res, next) {
  if (req.path.startsWith('/api/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
}

module.exports = {
  securityHeaders,
  originGuard,
  botGuard,
  noIndexApi,
  getClientIP,
  allowedOrigins
};
