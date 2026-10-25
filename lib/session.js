'use strict';

const { encryptJSON, decryptJSON, randomSid } = require('./crypto');
const { maskEmail } = require('./errors');

const COOKIE_NAME = 'am_session';
const SESSION_TTL_MS = 30 * 60 * 1000;

function isSecureCookie() {
  return process.env.NODE_ENV === 'production' || String(process.env.COOKIE_SECURE).toLowerCase() === 'true';
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS
  };
}

function createSession() {
  return {
    sid: randomSid(),
    email: null,
    token: null,
    step: 1,
    result: null,
    lastError: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
}

function normalizeSession(data) {
  if (!data || typeof data !== 'object') return null;
  if (!data.sid || typeof data.sid !== 'string') return null;
  if (!Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) return null;

  const session = {
    sid: data.sid,
    email: typeof data.email === 'string' ? data.email : null,
    token: typeof data.token === 'string' ? data.token : null,
    step: [1, 2, 3].includes(data.step) ? data.step : 1,
    result: data.result && typeof data.result === 'object' ? data.result : null,
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
    createdAt: Number.isFinite(data.createdAt) ? data.createdAt : Date.now(),
    expiresAt: data.expiresAt
  };

  if (session.email && session.step < 2) session.step = 2;
  if (session.step === 3 && !session.result && !session.token) session.step = 2;

  return session;
}

function readSession(req) {
  const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!raw) return null;
  return normalizeSession(decryptJSON(raw));
}

function ensureSession(req) {
  const existing = readSession(req);
  if (existing) return { session: existing, isNew: false };
  return { session: createSession(), isNew: true };
}

function saveSession(res, session) {
  session.expiresAt = Date.now() + SESSION_TTL_MS;

  if (session.result && session.token) {
    session.token = null;
  }

  const payload = encryptJSON(session);

  if (payload.length > 3900) {
    console.warn('[session] Payload cookie terlalu besar, token mungkin tidak tersimpan.');
  }

  res.cookie(COOKIE_NAME, payload, cookieOptions());
  return session;
}

function clearSession(res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(COOKIE_NAME, options);
}

function publicSession(session) {
  return {
    step: session.step,
    emailMasked: session.email ? maskEmail(session.email) : null,
    hasToken: Boolean(session.token),
    canRetry: Boolean(session.token) && !session.result,
    result: session.result ? publicResult(session.result) : null
  };
}

function publicResult(result) {
  if (!result || typeof result !== 'object') return null;

  return {
    emailMasked: result.email ? maskEmail(result.email) : null,
    status: result.status || '-',
    license: result.license || '-',
    expired: result.expired || '-',
    product: result.product || '-',
    order: result.order || '-'
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSession,
  readSession,
  ensureSession,
  saveSession,
  clearSession,
  publicSession,
  publicResult,
  isSecureCookie
};
