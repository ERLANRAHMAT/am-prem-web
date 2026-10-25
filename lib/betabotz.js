'use strict';

const axios = require('axios');

const ENDPOINTS = Object.freeze({
  magicLink: 'am-magicLink',
  verifyMagicLink: 'am-verifyMagicLink',
  purchasePremium: 'am-purchasePremium'
});

const DEFAULT_API_URL = 'https://api.betabotz.eu.org/api/tools';
const REQUEST_TIMEOUT_MS = 60 * 1000;

function getApiUrl() {
  return (process.env.BETABOTZ_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

function getAccessKey() {
  const key = (process.env.BETABOTZ_AKSES_KEY || '').trim();
  if (!key) {
    throw new Error('Konfigurasi server belum lengkap.');
  }
  return key;
}

async function callAPI(endpoint, payload) {
  const { data } = await axios.post(`${getApiUrl()}/${endpoint}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxBodyLength: 1024 * 1024,
    maxContentLength: 1024 * 1024
  });

  if (data && data.status === false) {
    throw new Error(
      data?.result?.message || data?.message || 'Permintaan API gagal.'
    );
  }

  return data;
}

async function sendMagicLink(email) {
  const data = await callAPI(ENDPOINTS.magicLink, {
    aksesKey: getAccessKey(),
    email
  });

  return {
    message: data?.result?.message || data?.message || 'Magic link berhasil dikirim.',
    raw: data
  };
}

async function verifyMagicLink(email, rawUrl) {
  const data = await callAPI(ENDPOINTS.verifyMagicLink, {
    aksesKey: getAccessKey(),
    email,
    rawUrl
  });

  const token = data?.result?.token;

  if (typeof token !== 'string' || token.length < 10) {
    throw new Error('Verifikasi berhasil, tetapi token tidak ditemukan pada respons API.');
  }

  return {
    token,
    message: data?.result?.message || 'Link berhasil diverifikasi.',
    raw: data
  };
}

async function purchasePremium(email, token) {
  const data = await callAPI(ENDPOINTS.purchasePremium, {
    aksesKey: getAccessKey(),
    email,
    token
  });

  const result = data?.result || {};
  const purchase = result.purchase || {};
  const licenses = Array.isArray(result.licenses) ? result.licenses : [];
  const licence = licenses[0] || {};
  const expiryMs = licence.expires || purchase.expiryTimeMillis;

  return {
    email,
    status: result.message || 'Premium aktif',
    license: result.licenseStatus || 'OK',
    expired: formatExpiry(expiryMs),
    product: licence.productId || '-',
    order: licence.orderNumber || '-'
  };
}

function formatExpiry(value) {
  if (value === undefined || value === null || value === '') return 'Tidak diketahui';

  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Tidak diketahui';

  try {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);

    return `${formatted} WIB`;
  } catch {
    return date.toISOString();
  }
}

module.exports = {
  ENDPOINTS,
  DEFAULT_API_URL,
  REQUEST_TIMEOUT_MS,
  getApiUrl,
  callAPI,
  sendMagicLink,
  verifyMagicLink,
  purchasePremium,
  formatExpiry
};
