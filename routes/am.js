'use strict';

const express = require('express');
const router = express.Router();

const { ensureSession, saveSession, clearSession, publicSession, publicResult } = require('../lib/session');
const { hmac } = require('../lib/crypto');
const {
  getErrorMessage,
  truncate,
  redact,
  maskEmail,
  sendOk,
  sendFail,
  logSafe
} = require('../lib/errors');
const { validateEmail, validateRawUrl, isHoneypotFilled } = require('../lib/validate');
const { isDisposableEmail } = require('../lib/disposable');
const { isEnabled: captchaEnabled, getSiteKey, verifyTurnstile } = require('../lib/turnstile');
const { sendMagicLink, verifyMagicLink, purchasePremium } = require('../lib/betabotz');
const rateLimit = require('../lib/rateLimit');
const {
  LIMITS,
  apiGuard,
  nonceGuard,
  issueNonce,
  enforceLimit,
  noteViolation,
  rateLimited
} = require('../middleware/guard');

const RETRY_MESSAGE = 'Purchase belum berhasil. Klik Retry Purchase untuk mencoba lagi.';

router.use(apiGuard);

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function emailKey(email) {
  return hmac(`email:${email}`);
}

function safeMessage(error, fallback, secrets = []) {
  const accessKey = (process.env.BETABOTZ_AKSES_KEY || '').trim();
  const message = truncate(redact(getErrorMessage(error), [accessKey, ...secrets]), 400);
  return message || fallback;
}

router.post('/session', (req, res) => {
  const { session, isNew } = ensureSession(req);

  if (isNew) saveSession(res, session);

  return sendOk(res, 'Sesi aktif.', {
    ...publicSession(session),
    nonce: issueNonce(req),
    captchaEnabled: captchaEnabled(),
    turnstileSiteKey: captchaEnabled() ? getSiteKey() : null
  });
});

router.post(
  '/magic-link',
  nonceGuard,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const emailResult = validateEmail(body.email);

    if (!emailResult.ok) {
      return sendFail(res, 400, emailResult.message);
    }

    const email = emailResult.value;

    if (isHoneypotFilled(body.hp)) {
      noteViolation(req, 'honeypot');
      logSafe('honeypot', 'magic-link diisi field hp', { email, ipHash: req.ipHash });
      return sendOk(res, 'Jika email valid, magic link akan dikirim.', {
        step: 2,
        emailMasked: maskEmail(email)
      });
    }

    if (
      !enforceLimit(
        req,
        res,
        `magic:ip:${req.ipHash}`,
        LIMITS.magicIp.limit,
        LIMITS.magicIp.windowMs
      )
    ) {
      return undefined;
    }

    const key = emailKey(email);

    if (
      !enforceLimit(
        req,
        res,
        `magic:email:${key}`,
        LIMITS.magicEmail.limit,
        LIMITS.magicEmail.windowMs
      )
    ) {
      return undefined;
    }

    const cooldown = rateLimit.getCooldown(`cooldown:${key}`);
    if (cooldown > 0) {
      return rateLimited(
        res,
        cooldown,
        `Tunggu ${cooldown} detik sebelum mengirim ulang magic link.`
      );
    }

    if (isDisposableEmail(email)) {
      return sendFail(res, 400, 'Gunakan email aktif, bukan email sementara.');
    }

    const captcha = await verifyTurnstile(body.captchaToken, req.clientIp);
    if (!captcha.ok) {
      logSafe('captcha', (captcha.codes || []).join(',') || 'gagal', {
        email,
        ipHash: req.ipHash
      });
      return sendFail(res, 400, captcha.message);
    }

    const { session } = ensureSession(req);

    try {
      await sendMagicLink(email);

      session.email = email;
      session.token = null;
      session.result = null;
      session.lastError = null;
      session.step = 2;
      saveSession(res, session);

      rateLimit.setCooldown(`cooldown:${key}`, LIMITS.magicCooldownMs);

      logSafe('magic-link', 'magic link terkirim', { email, ipHash: req.ipHash });

      return sendOk(res, 'Magic link berhasil dikirim. Cek inbox dan folder spam.', {
        step: 2,
        emailMasked: maskEmail(email),
        cooldown: Math.floor(LIMITS.magicCooldownMs / 1000)
      });
    } catch (error) {
      const message = safeMessage(error, 'Gagal mengirim magic link. Coba lagi.', [email]);
      logSafe('magic-link', message, { email, ipHash: req.ipHash });
      return sendFail(res, 502, message);
    }
  })
);

router.post(
  '/verify',
  nonceGuard,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { session } = ensureSession(req);

    if (!session.email) {
      return sendFail(res, 409, 'Sesi email tidak ditemukan. Mulai dari Step 1.', {
        step: 1
      });
    }

    const urlResult = validateRawUrl(body.rawUrl);
    if (!urlResult.ok) {
      return sendFail(res, 400, urlResult.message, { step: 2 });
    }

    if (isHoneypotFilled(body.hp)) {
      noteViolation(req, 'honeypot');
      logSafe('honeypot', 'verify diisi field hp', { email: session.email, ipHash: req.ipHash });
      return sendOk(res, 'Permintaan diterima.', { step: 3, canRetry: false });
    }

    if (
      !enforceLimit(
        req,
        res,
        `verify:ip:${req.ipHash}`,
        LIMITS.verifyIp.limit,
        LIMITS.verifyIp.windowMs
      )
    ) {
      return undefined;
    }

    const captcha = await verifyTurnstile(body.captchaToken, req.clientIp);
    if (!captcha.ok) {
      logSafe('captcha', (captcha.codes || []).join(',') || 'gagal', {
        email: session.email,
        ipHash: req.ipHash
      });
      return sendFail(res, 400, captcha.message, { step: 2 });
    }

    let token;
    try {
      const verified = await verifyMagicLink(session.email, urlResult.value);
      token = verified.token;
    } catch (error) {
      const message = safeMessage(error, 'Verifikasi gagal. Pastikan link masih berlaku.', [
        session.email,
        urlResult.value
      ]);
      logSafe('verify', message, { email: session.email, ipHash: req.ipHash });
      return sendFail(res, 502, message, { step: 2 });
    }

    session.token = token;
    session.step = 3;
    session.result = null;
    session.lastError = null;
    saveSession(res, session);

    try {
      const result = await purchasePremium(session.email, token);

      session.result = result;
      session.token = null;
      session.step = 3;
      session.lastError = null;
      saveSession(res, session);

      logSafe('purchase', 'premium aktif', { email: session.email, ipHash: req.ipHash });

      return sendOk(res, result.status, {
        step: 3,
        canRetry: false,
        emailMasked: maskEmail(session.email),
        result: publicResult(result)
      });
    } catch (error) {
      const message = safeMessage(error, 'Purchase gagal. Silakan coba retry.', [
        session.email,
        token
      ]);
      session.token = token;
      session.result = null;
      session.step = 3;
      session.lastError = RETRY_MESSAGE;
      saveSession(res, session);

      logSafe('purchase', message, { email: session.email, ipHash: req.ipHash });

      return sendFail(res, 502, message, {
        step: 3,
        canRetry: true,
        emailMasked: maskEmail(session.email)
      });
    }
  })
);

router.post(
  '/premium',
  nonceGuard,
  asyncHandler(async (req, res) => {
    const { session } = ensureSession(req);

    if (!session.email) {
      return sendFail(res, 409, 'Sesi email tidak ditemukan. Mulai dari Step 1.', {
        step: 1
      });
    }

    if (!session.token) {
      return sendFail(
        res,
        409,
        session.result
          ? 'Aktivasi sudah selesai.'
          : 'Token tidak tersedia. Ulangi verifikasi link dari email.',
        { step: session.result ? 3 : 2, canRetry: false }
      );
    }

    if (
      !enforceLimit(
        req,
        res,
        `premium:${session.sid}`,
        LIMITS.premiumSession.limit,
        LIMITS.premiumSession.windowMs
      )
    ) {
      return undefined;
    }

    try {
      const result = await purchasePremium(session.email, session.token);

      session.result = result;
      session.token = null;
      session.step = 3;
      session.lastError = null;
      saveSession(res, session);

      logSafe('purchase-retry', 'premium aktif', { email: session.email, ipHash: req.ipHash });

      return sendOk(res, result.status, {
        step: 3,
        canRetry: false,
        emailMasked: maskEmail(session.email),
        result: publicResult(result)
      });
    } catch (error) {
      const message = safeMessage(error, 'Purchase gagal. Silakan coba lagi.', [
        session.email,
        session.token
      ]);
      session.result = null;
      session.step = 3;
      session.lastError = RETRY_MESSAGE;
      saveSession(res, session);

      logSafe('purchase-retry', message, { email: session.email, ipHash: req.ipHash });

      return sendFail(res, 502, message, {
        step: 3,
        canRetry: true,
        emailMasked: maskEmail(session.email)
      });
    }
  })
);

router.post('/reset', nonceGuard, (req, res) => {
  clearSession(res);
  return sendOk(res, 'Sesi dihapus. Silakan mulai lagi.', { step: 1 });
});

module.exports = router;
