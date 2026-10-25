(function () {
  'use strict';

  var body = document.body;
  if (!body || body.dataset.env !== 'production') return;

  var overlay = null;
  var blocked = false;

  function isEditable(element) {
    if (!element) return false;
    var tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable === true;
  }

  function showOverlay() {
    if (overlay || blocked) return;
    blocked = true;
    body.classList.add('inspect-blocked');

    overlay = document.createElement('div');
    overlay.className = 'inspect-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'inspect-title');
    overlay.setAttribute('aria-describedby', 'inspect-desc');

    var box = document.createElement('div');
    box.className = 'inspect-box';

    var title = document.createElement('h2');
    title.id = 'inspect-title';
    title.textContent = 'Developer tools terdeteksi';

    var description = document.createElement('p');
    description.id = 'inspect-desc';
    description.textContent =
      'Tutup developer tools untuk melanjutkan. Halaman ini dilindungi dan seluruh proses berjalan di server.';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.textContent = 'Muat Ulang';
    button.addEventListener('click', function () {
      window.location.reload();
    });

    box.appendChild(title);
    box.appendChild(description);
    box.appendChild(button);
    overlay.appendChild(box);
    body.appendChild(overlay);
    button.focus();

    overlay.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      button.focus();
    });
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    blocked = false;
    body.classList.remove('inspect-blocked');
  }

  function sizeCheck() {
    if (!window.outerWidth || !window.innerWidth) return false;
    if (window.innerWidth < 800) return false;
    return Math.abs(window.outerWidth - window.innerWidth) > 160;
  }

  function timingCheck() {
    if (!window.performance || typeof window.performance.now !== 'function') return false;
    var start = window.performance.now();
    debugger;
    return window.performance.now() - start > 120;
  }

  document.addEventListener(
    'contextmenu',
    function (event) {
      if (isEditable(event.target)) return;
      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    'selectstart',
    function (event) {
      if (isEditable(event.target)) return;
      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    'dragstart',
    function (event) {
      if (isEditable(event.target)) return;
      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    'keydown',
    function (event) {
      var key = String(event.key || '').toLowerCase();
      var mod = event.ctrlKey || event.metaKey;
      var combo = false;

      if (event.key === 'F12') combo = true;
      if (mod && event.shiftKey && (key === 'i' || key === 'j' || key === 'c')) combo = true;
      if (mod && !event.shiftKey && (key === 'u' || key === 's')) combo = true;
      if (event.metaKey && event.altKey && (key === 'i' || key === 'j' || key === 'u' || key === 'c')) {
        combo = true;
      }

      if (combo) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

  function check() {
    if (blocked) {
      if (!sizeCheck()) hideOverlay();
      return;
    }

    if (sizeCheck() || timingCheck()) {
      showOverlay();
    }
  }

  window.addEventListener('load', function () {
    window.setTimeout(check, 700);
  });

  window.addEventListener('resize', check);

  window.setInterval(function () {
    if (blocked) {
      if (!sizeCheck()) hideOverlay();
    } else if (sizeCheck() || timingCheck()) {
      showOverlay();
    }
  }, 2500);
})();
