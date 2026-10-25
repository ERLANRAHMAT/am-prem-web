'use strict';

const crypto = require('crypto');

const DEV_SECRET = 'am-generator-dev-only-secret-change-me-32b';
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_SKEW_MS = 30 * 1000;

let warnedDevSecret = false;

function getSecret() {
  const secret = (process.env.SESSION_SECRET || '').trim();

  if (secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET wajib diisi minimal 32 karakter di production.');
  }

  if (!warnedDevSecret) {
    warnedDevSecret = true;
    console.warn('[security] SESSION_SECRET belum diatur. Memakai secret development (jangan dipakai di production).');
  }

  return secret ? `${DEV_SECRET}:${secret}` : DEV_SECRET;
}

function getKey() {
  return crypto.createHash('sha256').update(`am-session-key:${getSecret()}`).digest();
}

function getSalt() {
  return (process.env.IP_SALT || '').trim() || getSecret();
}

function encryptJSON(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function decryptJSON(payload) {
  if (typeof payload !== 'string' || payload.length === 0) return null;

  try {
    const raw = Buffer.from(payload, 'base64url');
    if (raw.length < 29) return null;

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const data = JSON.parse(plaintext);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function hmac(value) {
  return crypto.createHmac('sha256', getSecret()).update(String(value)).digest('base64url');
}

function hashIP(ip) {
  return crypto
    .createHmac('sha256', getSalt())
    .update(`ip:${String(ip || 'unknown')}`)
    .digest('hex');
}

function randomSid() {
  return crypto.randomBytes(16).toString('hex');
}

function createNonce(ipHash) {
  const timestamp = Date.now().toString();
  const signature = hmac(`${timestamp}.${ipHash}`);
  return `${timestamp}.${signature}`;
}

function verifyNonce(nonce, ipHash) {
  if (typeof nonce !== 'string' || nonce.length < 20 || nonce.length > 128) {
    return { ok: false, reason: 'format' };
  }

  const separator = nonce.indexOf('.');
  if (separator < 1) return { ok: false, reason: 'format' };

  const timestamp = nonce.slice(0, separator);
  const signature = nonce.slice(separator + 1);

  if (!/^\d{13}$/.test(timestamp) || !signature) {
    return { ok: false, reason: 'format' };
  }

  const expected = hmac(`${timestamp}.${ipHash}`);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: 'signature' };
  }

  const age = Date.now() - Number(timestamp);
  if (age < -NONCE_SKEW_MS || age > NONCE_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left), 'utf8');
  const b = Buffer.from(String(right), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  NONCE_TTL_MS,
  encryptJSON,
  decryptJSON,
  hmac,
  hashIP,
  randomSid,
  createNonce,
  verifyNonce,
  safeEqual,
  getSecret
};
