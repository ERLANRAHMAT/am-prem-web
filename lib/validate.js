'use strict';

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const ALLOWED_LINK_DOMAINS = ['alightcreative.com', 'firebaseapp.com'];

function validateEmail(input) {
  if (typeof input !== 'string') {
    return { ok: false, message: 'Email wajib diisi.' };
  }

  const email = input.trim().toLowerCase();

  if (!email) {
    return { ok: false, message: 'Email wajib diisi.' };
  }

  if (email.length > 254) {
    return { ok: false, message: 'Email terlalu panjang (maksimal 254 karakter).' };
  }

  if (/\s/.test(email) || email.includes('..')) {
    return { ok: false, message: 'Format email tidak valid.' };
  }

  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) {
    return { ok: false, message: 'Format email tidak valid.' };
  }

  const localPart = email.slice(0, at);

  if (localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.')) {
    return { ok: false, message: 'Format email tidak valid.' };
  }

  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: 'Format email tidak valid.' };
  }

  const tld = email.slice(at + 1).split('.').pop();
  if (!tld || tld.length < 2) {
    return { ok: false, message: 'Format email tidak valid.' };
  }

  return { ok: true, value: email };
}

function isAllowedLinkHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return ALLOWED_LINK_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function validateRawUrl(input) {
  if (typeof input !== 'string') {
    return { ok: false, message: 'Link dari email wajib diisi.' };
  }

  const value = input.trim();

  if (!value) {
    return { ok: false, message: 'Link dari email wajib diisi.' };
  }

  if (value.length > 2048) {
    return { ok: false, message: 'Link terlalu panjang (maksimal 2048 karakter).' };
  }

  if (!/^https:\/\//i.test(value)) {
    return { ok: false, message: 'Link harus diawali https://' };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'Link tidak valid. Salin seluruh link dari email.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'Link harus menggunakan https://' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Link tidak valid.' };
  }

  if (!isAllowedLinkHost(parsed.hostname)) {
    return {
      ok: false,
      message: 'Host link tidak dikenali. Gunakan link asli dari email Alight Motion.'
    };
  }

  const oobCode = parsed.searchParams.get('oobCode');
  if (!oobCode || !oobCode.trim()) {
    return { ok: false, message: 'Link tidak memiliki oobCode. Salin seluruh link dari email.' };
  }

  return { ok: true, value };
}

function isHoneypotFilled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = {
  ALLOWED_LINK_DOMAINS,
  validateEmail,
  validateRawUrl,
  isAllowedLinkHost,
  isHoneypotFilled
};
