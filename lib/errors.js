'use strict';

function getErrorMessage(error) {
  const responseData = error && error.response ? error.response.data : null;

  if (responseData) {
    if (typeof responseData === 'string') return responseData;

    return (
      responseData?.result?.message ||
      responseData?.message ||
      responseData?.error ||
      responseData?.msg ||
      JSON.stringify(responseData, null, 2)
    );
  }

  return (error && error.message) || String(error);
}

function truncate(value, max = 500) {
  const text = String(value == null ? '' : value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function redact(value, secrets = []) {
  let text = String(value == null ? '' : value);

  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 6) continue;
    text = text.split(secret).join('[disensor]');
  }

  return text;
}

function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '***';

  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  let visibleCount = 2;
  if (local.length <= 2) visibleCount = 0;
  else if (local.length <= 4) visibleCount = 1;

  const visible = local.slice(0, visibleCount);
  const hidden = '*'.repeat(Math.max(2, Math.min(8, local.length - visible.length)));

  return `${visible}${hidden}@${domain}`;
}

function sendOk(res, message, data) {
  const body = { ok: true, message: message || 'OK' };
  if (data !== undefined) body.data = data;
  return res.status(200).json(body);
}

function sendFail(res, status, message, data) {
  const body = { ok: false, message: message || 'Permintaan tidak dapat diproses.' };
  if (data !== undefined) body.data = data;
  return res.status(status).json(body);
}

function logSafe(context, message, meta = {}) {
  const parts = [`[${context}]`];

  if (meta.email) parts.push(`email=${maskEmail(meta.email)}`);
  if (meta.ipHash) parts.push(`ip=${String(meta.ipHash).slice(0, 12)}`);
  if (meta.reason) parts.push(`reason=${meta.reason}`);

  console.error(`${parts.join(' ')} ${truncate(message, 300)}`);
}

module.exports = {
  getErrorMessage,
  truncate,
  redact,
  maskEmail,
  sendOk,
  sendFail,
  logSafe
};
