(function () {
  'use strict';

  var app = document.getElementById('app');
  if (!app) return;

  var COOLDOWN_KEY = 'am_magic_cooldown_until';

  var magicForm = document.getElementById('magic-form');
  var verifyForm = document.getElementById('verify-form');
  var emailInput = document.getElementById('email');
  var rawUrlInput = document.getElementById('rawUrl');
  var hpMagic = document.getElementById('hp-magic');
  var hpVerify = document.getElementById('hp-verify');
  var magicStatus = document.getElementById('magic-status');
  var verifyStatus = document.getElementById('verify-status');
  var retryStatus = document.getElementById('retry-status');
  var magicBtn = document.getElementById('magic-submit');
  var verifyBtn = document.getElementById('verify-submit');
  var retryBtn = document.getElementById('retry-btn');
  var resetBtn = document.getElementById('reset-btn');
  var verifyEmail = document.getElementById('verify-email');
  var resultSuccess = document.getElementById('result-success');
  var resultRetry = document.getElementById('result-retry');
  var retryMessage = document.getElementById('retry-message');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.step-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.step-panel'));

  var state = {
    step: Number(app.dataset.step) || 1,
    maxStep: Number(app.dataset.step) || 1,
    email: app.dataset.email || '',
    emailMasked: app.dataset.emailMasked || '',
    hasToken: app.dataset.hasToken === '1',
    canRetry: app.dataset.canRetry === '1',
    hasResult: !resultSuccess.hidden,
    captchaEnabled: app.dataset.captchaEnabled === '1',
    turnstileKey: app.dataset.turnstileKey || '',
    nonce: '',
    nonceAt: 0,
    widgets: { magic: null, verify: null },
    captchaPromises: { magic: null, verify: null },
    magicBusy: false,
    verifyBusy: false,
    retryBusy: false,
    cooldowns: { magic: 0, verify: 0 },
    cooldownTimer: null
  };

  function statusElement(kind) {
    if (kind === 'magic') return magicStatus;
    if (kind === 'verify') return verifyStatus;
    return retryStatus;
  }

  function setStatus(element, type, message) {
    if (!element) return;
    element.className = 'status' + (type ? ' is-' + type : '');
    element.textContent = message || '';
  }

  function clearStatus(element) {
    setStatus(element, '', '');
  }

  function messageFrom(json, fallback) {
    if (!json) return fallback;
    if (typeof json === 'string') return json;
    return json.message || json.error || json.msg || (json.result && json.result.message) || fallback;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isEmailLike(value) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function formatWait(seconds) {
    if (seconds >= 120) return Math.ceil(seconds / 60) + ' menit';
    if (seconds >= 60) return '1 menit';
    return Math.max(1, seconds) + ' detik';
  }

  function readStoredCooldown() {
    try {
      var value = Number(window.localStorage.getItem(COOLDOWN_KEY));
      return Number.isFinite(value) && value > Date.now() ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function writeStoredCooldown(until) {
    try {
      if (until > Date.now()) {
        window.localStorage.setItem(COOLDOWN_KEY, String(until));
      } else {
        window.localStorage.removeItem(COOLDOWN_KEY);
      }
    } catch (error) {
      // localStorage bisa diblokir; abaikan.
    }
  }

  function remaining(kind) {
    return Math.max(0, Math.ceil((state.cooldowns[kind] - Date.now()) / 1000));
  }

  function startCooldown(kind, seconds) {
    var duration = Math.max(1, Number(seconds) || 60);
    state.cooldowns[kind] = Date.now() + duration * 1000;

    if (kind === 'magic') writeStoredCooldown(state.cooldowns[kind]);

    updateCooldownUI();

    if (!state.cooldownTimer) {
      state.cooldownTimer = window.setInterval(updateCooldownUI, 500);
    }
  }

  function updateCooldownUI() {
    var magicLeft = remaining('magic');
    var verifyLeft = remaining('verify');
    var magicLabel = magicBtn.querySelector('.btn-label');
    var verifyLabel = verifyBtn.querySelector('.btn-label');

    if (magicLeft > 0) {
      magicBtn.disabled = true;
      magicLabel.textContent = 'Kirim ulang dalam ' + formatWait(magicLeft);
    } else if (!state.magicBusy) {
      magicBtn.disabled = false;
      magicLabel.textContent = 'Kirim Magic Link';
      writeStoredCooldown(0);
    }

    if (verifyLeft > 0) {
      verifyBtn.disabled = true;
      verifyLabel.textContent = 'Coba lagi dalam ' + formatWait(verifyLeft);
    } else if (!state.verifyBusy) {
      verifyBtn.disabled = false;
      verifyLabel.textContent = 'Verifikasi & Aktifkan Premium';
    }

    if (magicLeft <= 0 && verifyLeft <= 0 && state.cooldownTimer) {
      window.clearInterval(state.cooldownTimer);
      state.cooldownTimer = null;
    }
  }

  function setFormBusy(kind, busy, label) {
    var button = kind === 'magic' ? magicBtn : verifyBtn;
    var labelElement = button.querySelector('.btn-label');

    state[kind + 'Busy'] = busy;

    if (busy) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      if (label) labelElement.textContent = label;
    } else {
      button.removeAttribute('aria-busy');
      updateCooldownUI();
    }
  }

  function setRetryBusy(busy) {
    var labelElement = retryBtn.querySelector('.btn-label');
    state.retryBusy = busy;

    if (busy) {
      retryBtn.disabled = true;
      retryBtn.setAttribute('aria-busy', 'true');
      labelElement.textContent = 'Memproses...';
    } else {
      retryBtn.removeAttribute('aria-busy');
      retryBtn.disabled = !state.hasToken;
      labelElement.textContent = 'Retry Purchase';
    }
  }

  function isUnlocked(step) {
    if (step === 1) return true;
    if (step === 2) return Boolean(state.email) && state.maxStep >= 2;
    if (step === 3) return state.maxStep >= 3;
    return false;
  }

  function focusPanel(step) {
    var panel = document.querySelector('[data-panel-step="' + step + '"]');
    if (!panel) return;
    var heading = panel.querySelector('h2');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }

  function setStep(step, options) {
    var next = Math.max(1, Math.min(3, Number(step) || 1));
    var focus = options && options.focusPanel;

    state.step = next;
    state.maxStep = Math.max(state.maxStep, next);
    app.dataset.step = String(next);

    tabs.forEach(function (tab) {
      var tabStep = Number(tab.dataset.tabStep);
      var unlocked = isUnlocked(tabStep);
      var active = tabStep === next;
      var sub = tab.querySelector('.step-sub');
      var lock = tab.querySelector('.step-lock');

      tab.classList.toggle('is-active', active);
      tab.classList.toggle('is-locked', !unlocked);
      tab.disabled = !unlocked;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      tab.tabIndex = active ? 0 : -1;

      if (sub) {
        if (!unlocked) sub.textContent = 'Terkunci';
        else if (tabStep === 1) sub.textContent = 'Kirim link';
        else if (tabStep === 2) sub.textContent = 'Tempel link';
        else sub.textContent = 'Status';
      }

      if (lock) {
        if (unlocked) lock.setAttribute('hidden', '');
        else lock.removeAttribute('hidden');
      }
    });

    panels.forEach(function (panel) {
      panel.hidden = Number(panel.dataset.panelStep) !== next;
    });

    if (next === 1) ensureCaptcha('magic');
    if (next === 2) ensureCaptcha('verify');

    if (focus) focusPanel(next);
  }

  function updateEmailLabels() {
    if (verifyEmail) {
      verifyEmail.textContent = state.email || state.emailMasked || 'Belum ada email';
    }
  }

  async function loadNonce(force) {
    if (!force && state.nonce && Date.now() - state.nonceAt < 90000) {
      return { ok: true };
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, 15000)
      : null;

    try {
      var response = await fetch('/api/am/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin',
        body: '{}',
        signal: controller ? controller.signal : undefined
      });

      var json = await response.json().catch(function () {
        return null;
      });

      if (response.ok && json && json.data && json.data.nonce) {
        state.nonce = json.data.nonce;
        state.nonceAt = Date.now();
        return { ok: true };
      }

      return {
        ok: false,
        res: response,
        json: json || { ok: false, message: 'Gagal menyiapkan sesi keamanan.' }
      };
    } catch (error) {
      return {
        ok: false,
        res: null,
        json: {
          ok: false,
          message: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'
        }
      };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function sendRequest(path, body) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, 70000)
      : null;

    try {
      var response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-nonce': state.nonce
        },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
        signal: controller ? controller.signal : undefined
      });

      var json = await response.json().catch(function () {
        return null;
      });

      return {
        res: response,
        json:
          json || {
            ok: false,
            message: response.ok
              ? 'Respons server tidak valid.'
              : 'Terjadi kesalahan pada server. Coba lagi.'
          }
      };
    } catch (error) {
      return {
        res: null,
        json: {
          ok: false,
          message: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'
        }
      };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function api(path, body) {
    var nonceResult = await loadNonce(false);
    if (!nonceResult.ok) {
      return { res: nonceResult.res, json: nonceResult.json };
    }

    var result = await sendRequest(path, body);

    if (result.res && result.res.status === 403) {
      var retryNonce = await loadNonce(true);
      if (!retryNonce.ok) {
        return { res: retryNonce.res, json: retryNonce.json };
      }
      result = await sendRequest(path, body);
    }

    return result;
  }

  function ensureCaptcha(kind) {
    if (!state.captchaEnabled || !state.turnstileKey) return Promise.resolve(true);
    if (state.widgets[kind] !== null && state.widgets[kind] !== undefined) {
      return Promise.resolve(true);
    }
    if (state.captchaPromises[kind]) return state.captchaPromises[kind];

    state.captchaPromises[kind] = new Promise(function (resolve) {
      var started = Date.now();

      function attempt() {
        if (window.turnstile && typeof window.turnstile.render === 'function') {
          var container = document.getElementById('turnstile-' + kind);
          if (!container) {
            resolve(false);
            return;
          }

          try {
            state.widgets[kind] = window.turnstile.render(container, {
              sitekey: state.turnstileKey,
              theme: 'light',
              callback: function () {},
              'expired-callback': function () {
                setStatus(statusElement(kind), 'info', 'Captcha kedaluwarsa. Selesaikan captcha lagi.');
              },
              'error-callback': function () {
                setStatus(
                  statusElement(kind),
                  'error',
                  'Captcha gagal dimuat. Muat ulang halaman lalu coba lagi.'
                );
              }
            });
            resolve(true);
          } catch (error) {
            resolve(false);
          }
          return;
        }

        if (Date.now() - started > 12000) {
          resolve(false);
          return;
        }

        window.setTimeout(attempt, 250);
      }

      attempt();
    });

    return state.captchaPromises[kind];
  }

  function getCaptcha(kind) {
    if (!state.captchaEnabled) return '';
    var widget = state.widgets[kind];
    if (widget === null || widget === undefined) return '';
    if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') return '';

    try {
      return window.turnstile.getResponse(widget) || '';
    } catch (error) {
      return '';
    }
  }

  function resetCaptcha(kind) {
    if (!state.captchaEnabled) return;
    var widget = state.widgets[kind];
    if (widget === null || widget === undefined) return;
    if (!window.turnstile || typeof window.turnstile.reset !== 'function') return;

    try {
      window.turnstile.reset(widget);
    } catch (error) {
      // Abaikan; widget akan di-reset pada percobaan berikutnya.
    }
  }

  async function requireCaptcha(kind) {
    if (!state.captchaEnabled) return true;

    var ready = await ensureCaptcha(kind);
    if (!ready) {
      state.captchaPromises[kind] = null;
      setStatus(
        statusElement(kind),
        'error',
        'Captcha tidak dapat dimuat. Muat ulang halaman lalu coba lagi.'
      );
      return false;
    }

    if (!getCaptcha(kind)) {
      setStatus(statusElement(kind), 'error', 'Selesaikan captcha terlebih dahulu.');
      return false;
    }

    return true;
  }

  function setResultText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value || '-';
  }

  function renderResult(result) {
    var email = state.email || (result && result.emailMasked) || '-';

    setResultText('result-email', email);
    setResultText('result-status', (result && result.status) || '-');
    setResultText('result-license', (result && result.license) || '-');
    setResultText('result-expired', (result && result.expired) || '-');
    setResultText('result-product', (result && result.product) || '-');
    setResultText('result-order', (result && result.order) || '-');

    resultSuccess.hidden = false;
    resultRetry.hidden = true;
    state.hasResult = true;
    state.hasToken = false;
    clearStatus(retryStatus);
    retryBtn.disabled = true;
  }

  function showRetry(message) {
    resultSuccess.hidden = true;
    resultRetry.hidden = false;
    retryMessage.textContent =
      message || 'Verifikasi berhasil, tetapi purchase premium belum selesai.';
    retryBtn.disabled = !state.hasToken;
    clearStatus(retryStatus);
    state.hasResult = false;
  }

  async function handleMagicSubmit(event) {
    event.preventDefault();

    if (state.magicBusy || remaining('magic') > 0) return;

    var email = normalizeEmail(emailInput.value);

    if (!email) {
      setStatus(magicStatus, 'error', 'Email wajib diisi.');
      emailInput.focus();
      return;
    }

    if (!isEmailLike(email)) {
      setStatus(magicStatus, 'error', 'Format email tidak valid. Contoh: nama@email.com');
      emailInput.focus();
      return;
    }

    if (!(await requireCaptcha('magic'))) return;

    var captchaToken = getCaptcha('magic');

    setStatus(magicStatus, 'info', 'Mengirim magic link...');
    setFormBusy('magic', true, 'Mengirim...');

    try {
      var result = await api('/api/am/magic-link', {
        email: email,
        captchaToken: captchaToken,
        hp: hpMagic ? hpMagic.value : ''
      });

      if (result.json.ok) {
        state.email = email;
        state.emailMasked = (result.json.data && result.json.data.emailMasked) || '';
        state.hasToken = false;
        state.hasResult = false;
        state.maxStep = 2;

        resultSuccess.hidden = true;
        resultRetry.hidden = true;
        retryBtn.disabled = true;
        setResultText('result-email', '-');
        setResultText('result-status', '-');
        setResultText('result-license', '-');
        setResultText('result-expired', '-');
        setResultText('result-product', '-');
        setResultText('result-order', '-');

        emailInput.value = email;
        updateEmailLabels();

        setStatus(magicStatus, 'success', result.json.message);
        setStatus(
          verifyStatus,
          'success',
          'Magic link terkirim. Cek inbox dan folder spam, lalu tempel link di bawah.'
        );

        startCooldown('magic', (result.json.data && result.json.data.cooldown) || 60);
        setStep(2, { focusPanel: true });
        return;
      }

      var message = messageFrom(result.json, 'Gagal mengirim magic link. Coba lagi.');
      setStatus(magicStatus, 'error', message);

      if (result.res && result.res.status === 429) {
        startCooldown('magic', (result.json.data && result.json.data.retryAfter) || 60);
      }
    } finally {
      resetCaptcha('magic');
      setFormBusy('magic', false);
    }
  }

  async function handleVerifySubmit(event) {
    event.preventDefault();

    if (state.verifyBusy) return;

    var rawUrl = rawUrlInput.value.trim();

    if (!rawUrl) {
      setStatus(verifyStatus, 'error', 'Link dari email wajib diisi.');
      rawUrlInput.focus();
      return;
    }

    if (rawUrl.length > 2048) {
      setStatus(verifyStatus, 'error', 'Link terlalu panjang (maksimal 2048 karakter).');
      rawUrlInput.focus();
      return;
    }

    if (!/^https:\/\//i.test(rawUrl)) {
      setStatus(verifyStatus, 'error', 'Link harus diawali https://');
      rawUrlInput.focus();
      return;
    }

    if (rawUrl.indexOf('oobCode') === -1) {
      setStatus(
        verifyStatus,
        'error',
        'Link tidak memiliki oobCode. Salin seluruh link dari email.'
      );
      rawUrlInput.focus();
      return;
    }

    if (!(await requireCaptcha('verify'))) return;

    var captchaToken = getCaptcha('verify');

    setStatus(verifyStatus, 'info', 'Memverifikasi link dan menjalankan purchase premium...');
    setFormBusy('verify', true, 'Memproses...');

    try {
      var result = await api('/api/am/verify', {
        rawUrl: rawUrl,
        captchaToken: captchaToken,
        hp: hpVerify ? hpVerify.value : ''
      });

      if (result.json.ok && result.json.data && result.json.data.result) {
        renderResult(result.json.data.result);
        state.maxStep = Math.max(state.maxStep, 3);
        setStatus(verifyStatus, 'success', 'Aktivasi berhasil.');
        setStep(3, { focusPanel: true });
        return;
      }

      if (result.json.data && result.json.data.canRetry) {
        state.hasToken = true;
        state.hasResult = false;
        state.maxStep = Math.max(state.maxStep, 3);
        showRetry(result.json.message);
        setStep(3, { focusPanel: true });
        return;
      }

      if (result.json.ok) {
        state.hasToken = false;
        state.hasResult = false;
        state.maxStep = Math.max(state.maxStep, 3);
        showRetry(result.json.message || 'Permintaan diterima.');
        setStep(3, { focusPanel: true });
        return;
      }

      var message = messageFrom(result.json, 'Verifikasi gagal. Coba lagi.');

      if (result.json.data && result.json.data.step === 1) {
        state.maxStep = 1;
        state.email = '';
        state.emailMasked = '';
        updateEmailLabels();
        setStatus(magicStatus, 'error', message);
        setStep(1, { focusPanel: true });
        return;
      }

      setStatus(verifyStatus, 'error', message);

      if (result.res && result.res.status === 429) {
        startCooldown('verify', (result.json.data && result.json.data.retryAfter) || 60);
      }
    } finally {
      resetCaptcha('verify');
      setFormBusy('verify', false);
    }
  }

  async function handleRetry() {
    if (state.retryBusy || !state.hasToken) return;

    setRetryBusy(true);
    setStatus(retryStatus, 'info', 'Mencoba purchase ulang...');

    try {
      var result = await api('/api/am/premium', {});

      if (result.json.ok && result.json.data && result.json.data.result) {
        renderResult(result.json.data.result);
        setStatus(retryStatus, 'success', 'Aktivasi berhasil.');
        return;
      }

      if (result.json.data && result.json.data.canRetry) {
        state.hasToken = true;
        showRetry(result.json.message);
        setStatus(
          retryStatus,
          'error',
          messageFrom(result.json, 'Purchase masih gagal. Coba lagi beberapa saat lagi.')
        );
        return;
      }

      state.hasToken = false;
      retryBtn.disabled = true;
      var retryErrorMessage = messageFrom(
        result.json,
        'Token tidak tersedia. Ulangi verifikasi link.'
      );

      if (result.json.data && result.json.data.step === 1) {
        state.hasResult = false;
        state.maxStep = 1;
        state.email = '';
        state.emailMasked = '';
        updateEmailLabels();
        setStatus(magicStatus, 'error', retryErrorMessage);
        setStep(1, { focusPanel: true });
        return;
      }

      setStatus(retryStatus, 'error', retryErrorMessage);
    } finally {
      setRetryBusy(false);
    }
  }

  async function handleReset() {
    resetBtn.disabled = true;
    setStatus(retryStatus, 'info', 'Menghapus sesi...');

    try {
      await api('/api/am/reset', {});
    } finally {
      writeStoredCooldown(0);
      window.location.reload();
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Lanjut ke fallback.
      }
    }

    try {
      var helper = document.createElement('textarea');
      helper.className = 'copy-helper';
      helper.value = text;
      helper.setAttribute('readonly', 'readonly');
      document.body.appendChild(helper);
      helper.select();
      var copied = document.execCommand('copy');
      document.body.removeChild(helper);
      return copied;
    } catch (error) {
      return false;
    }
  }

  function handleCopyClick(event) {
    var targetElement = event.target;
    if (!targetElement || typeof targetElement.closest !== 'function') return;

    var button = targetElement.closest('[data-copy-target]');
    if (!button) return;

    var target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;

    var text = target.textContent.trim();
    if (!text || text === '-') return;

    copyText(text).then(function (copied) {
      if (!copied) return;
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }
      button.textContent = 'Tersalin';
      button.classList.add('is-copied');
      window.setTimeout(function () {
        button.textContent = button.dataset.originalText || 'Salin';
        button.classList.remove('is-copied');
      }, 1500);
    });
  }

  function handleTabKeydown(event) {
    var key = event.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;

    var enabled = tabs.filter(function (tab) {
      return !tab.disabled;
    });
    if (!enabled.length) return;

    var current = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('.step-tab')
      : null;
    var index = enabled.indexOf(current);

    event.preventDefault();

    if (key === 'Home') index = 0;
    else if (key === 'End') index = enabled.length - 1;
    else if (key === 'ArrowRight') index = (index + 1) % enabled.length;
    else index = (index - 1 + enabled.length) % enabled.length;

    var target = enabled[index];
    setStep(Number(target.dataset.tabStep), { focusPanel: false });
    target.focus();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.disabled) return;
      setStep(Number(tab.dataset.tabStep), { focusPanel: true });
    });
  });

  var tabList = document.querySelector('.step-tabs');
  if (tabList) tabList.addEventListener('keydown', handleTabKeydown);

  magicForm.addEventListener('submit', handleMagicSubmit);
  verifyForm.addEventListener('submit', handleVerifySubmit);
  retryBtn.addEventListener('click', handleRetry);
  resetBtn.addEventListener('click', handleReset);
  document.addEventListener('click', handleCopyClick);

  emailInput.addEventListener('input', function () {
    if (magicStatus.classList.contains('is-error')) clearStatus(magicStatus);
  });

  rawUrlInput.addEventListener('input', function () {
    if (verifyStatus.classList.contains('is-error')) clearStatus(verifyStatus);
  });

  var storedCooldown = readStoredCooldown();
  if (storedCooldown) state.cooldowns.magic = storedCooldown;

  updateEmailLabels();

  if (state.step === 3 && !state.hasResult) {
    showRetry(app.dataset.lastError || 'Verifikasi berhasil, tetapi purchase premium belum selesai.');
    state.hasToken = app.dataset.hasToken === '1';
    retryBtn.disabled = !state.hasToken;
  }

  setStep(state.step, { focusPanel: false });
  updateCooldownUI();

  if (state.cooldowns.magic > Date.now()) {
    state.cooldownTimer = window.setInterval(updateCooldownUI, 500);
  }
})();
