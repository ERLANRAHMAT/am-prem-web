'use strict';

const axios = require('axios');

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isEnabled() {
  if (String(process.env.TURNSTILE_DISABLED).toLowerCase() === 'true') return false;
  return Boolean((process.env.TURNSTILE_SECRET || '').trim() && (process.env.TURNSTILE_SITE_KEY || '').trim());
}

function getSiteKey() {
  return (process.env.TURNSTILE_SITE_KEY || '').trim();
}

async function verifyTurnstile(token, remoteIp) {
  if (!isEnabled()) {
    return { ok: true, skipped: true };
  }

  if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
    return {
      ok: false,
      message: 'Verifikasi captcha wajib diselesaikan.'
    };
  }

  const params = new URLSearchParams();
  params.append('secret', (process.env.TURNSTILE_SECRET || '').trim());
  params.append('response', token.trim());
  if (remoteIp) params.append('remoteip', remoteIp);

  try {
    const { data } = await axios.post(VERIFY_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    if (data && data.success === true) {
      return { ok: true };
    }

    return {
      ok: false,
      message: 'Verifikasi captcha gagal. Muat ulang halaman lalu coba lagi.',
      codes: Array.isArray(data?.['error-codes']) ? data['error-codes'] : []
    };
  } catch {
    return {
      ok: false,
      message: 'Layanan captcha tidak dapat dihubungi. Coba lagi sebentar lagi.',
      codes: ['network-error']
    };
  }
}

module.exports = {
  isEnabled,
  getSiteKey,
  verifyTurnstile
};
