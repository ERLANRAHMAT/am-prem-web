'use strict';

const { hashIP, createNonce, verifyNonce } = require('../lib/crypto');
const { sendFail, logSafe } = require('../lib/errors');
const { getClientIP } = require('./security');
const rateLimit = require('../lib/rateLimit');

const LIMITS = Object.freeze({
  global: { limit: 60, windowMs: 60 * 1000 },
  magicIp: { limit: 3, windowMs: 10 * 60 * 1000 },
  magicEmail: { limit: 3, windowMs: 60 * 60 * 1000 },
  verifyIp: { limit: 5, windowMs: 10 * 60 * 1000 },
  premiumSession: { limit: 3, windowMs: 10 * 60 * 1000 },
  magicCooldownMs: 60 * 1000
});

function attachClient(req, res, next) {
  req.clientIp = getClientIP(req);
  req.ipHash = hashIP(req.clientIp);
  next();
}

function issueNonce(req) {
  return createNonce(req.ipHash);
}

function formatWait(seconds) {
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} menit`;
  if (seconds >= 60) return '1 menit';
  return `${Math.max(1, seconds)} detik`;
}

function rateLimited(res, retryAfter, message) {
  res.set('Retry-After', String(retryAfter));
  return sendFail(res, 429, message, { retryAfter });
}

function enforceLimit(req, res, key, limit, windowMs) {
  const result = rateLimit.consume(key, limit, windowMs);

  if (result.allowed) return true;

  const violation = rateLimit.addViolation(req.ipHash);

  if (violation.blocked) {
    logSafe('guard', 'IP otomatis diblokir 1 jam', {
      ipHash: req.ipHash,
      reason: 'rate-limit'
    });
  }

  rateLimited(
    res,
    result.retryAfter,
    `Terlalu banyak permintaan. Coba lagi dalam ${formatWait(result.retryAfter)}.`
  );
  return false;
}

function apiGuard(req, res, next) {
  if (req.path === '/health' || req.path === '/health/') return next();

  if (rateLimit.isBlocked(req.ipHash)) {
    return sendFail(res, 403, 'Akses diblokir sementara karena aktivitas mencurigakan.');
  }

  if (!enforceLimit(req, res, `global:${req.ipHash}`, LIMITS.global.limit, LIMITS.global.windowMs)) {
    return undefined;
  }

  return next();
}

function nonceGuard(req, res, next) {
  const nonce = req.get('x-nonce');
  const result = verifyNonce(nonce, req.ipHash);

  if (!result.ok) {
    if (result.reason === 'expired') {
      res.set('X-Nonce-Expired', '1');
      return sendFail(res, 403, 'Sesi keamanan kedaluwarsa. Muat ulang lalu coba lagi.');
    }

    return sendFail(res, 403, 'Permintaan ditolak. Nonce tidak valid.');
  }

  return next();
}

function noteViolation(req, reason) {
  const violation = rateLimit.addViolation(req.ipHash);

  if (violation.blocked) {
    logSafe('guard', 'IP otomatis diblokir 1 jam', {
      ipHash: req.ipHash,
      reason
    });
  }

  return violation;
}

module.exports = {
  LIMITS,
  attachClient,
  issueNonce,
  apiGuard,
  nonceGuard,
  enforceLimit,
  noteViolation,
  rateLimited,
  formatWait
};
