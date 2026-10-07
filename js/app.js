(function () {
  'use strict';

  var TapX = window.TapX = window.TapX || {};

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(el, value) {
    if (el) el.textContent = value === null || value === undefined ? '' : value;
  }

  function clear(el) {
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
  }
  function el(tag, className, text, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'href') node.setAttribute('href', attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  TapX.profileUrl = function (username) {
    var href = String(window.location.href).split('#')[0].split('?')[0];
    var dir = href.substring(0, href.lastIndexOf('/') + 1);
    return dir + 'profile.html?user=' + encodeURIComponent(username);
  };


  TapX.tapUrl = function (username) {
    var base = '';
    try {
      if (window.TapXStorage && window.TapXStorage.getSettings) {
        base = String((window.TapXStorage.getSettings() || {}).publicBase || '').trim();
      }
    } catch (e) { base = ''; }
    base = base.replace(/\/+$/, '');
    if (base && TapX.isValidUrl(base)) {
      return base + '/' + encodeURIComponent(username);
    }
    return TapX.profileUrl(username);
  };


  TapX.shortUrl = function (url) {
    var u = String(url || '');
    return /^https?:\/\//i.test(u) ? u.replace(/^https?:\/\//i, '') : u.split('/').pop();
  };

  TapX.isValidUrl = function (value) {
    try {
      var u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
  };

  /** Opens an external link safely. */
  TapX.external = function (href) {
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  var toastTimer = null;

  TapX.toast = function (message, kind) {
    var host = document.getElementById('toast-host');
    if (!host) {
      host = el('div', '', '', { id: 'toast-host', 'aria-live': 'polite' });
      host.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'z-index:9999;display:flex;flex-direction:column;gap:8px;' +
        'align-items:center;pointer-events:none;';
      document.body.appendChild(host);
    }

    var toast = el('div', 'toast toast--' + (kind || 'info'), message);
    toast.setAttribute('role', 'status');
    host.appendChild(toast);

    /* trigger the CSS entrance animation on the next frame */
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });

    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2600);

    clearTimeout(toastTimer);
  };


  TapX.copy = function (text, successMessage) {
    function done() {
      TapX.toast(successMessage || 'Copied to clipboard', 'success');
    }
    function failed() {
      TapX.toast('Could not copy automatically — please copy manually.',
        'error');
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text) ? done() : failed();
      });
    } else {
      fallbackCopy(text) ? done() : failed();
    }
  };

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }


  TapX.renderQR = function (container, text, size) {
    if (!container) return false;
    clear(container);

    if (typeof window.QRCode !== 'function') {
      /* CDN blocked / offline — show a friendly, still-useful fallback. */
      var fallback = el('div', 'qr-fallback');
      fallback.appendChild(el('p', 'qr-fallback__msg',
        'QR library could not load (offline?). Your profile URL is:'));
      var link = el('code', 'qr-fallback__url', text);
      fallback.appendChild(link);
      container.appendChild(fallback);
      TapX.toast('QR library unavailable — URL shown as text.', 'warn');
      return false;
    }

    try {
      size = size || 240;
      /* eslint-disable no-new */
      new window.QRCode(container, {
        text: text,
        width: size,
        height: size,
        colorDark: '#0b0d17',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
      container.setAttribute('data-qr-text', text);
      return true;
    } catch (e) {
      var msg = el('p', 'qr-error',
        'QR generation failed. Your profile URL: ' + text);
      container.appendChild(msg);
      return false;
    }
  };


  TapX.downloadQR = function (container, filename) {
    if (!container) return;
    var canvas = container.querySelector('canvas');
    var img = container.querySelector('img');
    var href = null;

    if (canvas && canvas.toDataURL) href = canvas.toDataURL('image/png');
    else if (img && img.src) href = img.src;

    if (!href) {
      TapX.toast('QR image not ready yet.', 'error');
      return;
    }
    var a = document.createElement('a');
    a.href = href;
    a.download = filename || 'tapx-qr.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    TapX.toast('QR code downloaded', 'success');
  };


  TapX.nfcStatus = function () {
    var supported = ('NDEFReader' in window);
    return {
      supported: supported,
      message: supported
        ? 'NFC support detected — some browsers also allow writing URLs directly.'
        : 'NFC writing is normally done using a dedicated NFC writing app.'
    };
  };


  TapX.initTheme = function () {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  };


  function initChrome() {
    /* dynamic copyright year */
    document.querySelectorAll('[data-year]').forEach(function (node) {
      setText(node, String(new Date().getFullYear()));
    });

    /* mobile navigation drawer */
    var burger = document.querySelector('[data-nav-toggle]');
    var drawer = document.getElementById('mobile-nav');
    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = drawer.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.classList.toggle('nav-open', open);
      });
      drawer.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          drawer.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('nav-open');
        }
      });
    }

  
    var revealNodes = document.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window && revealNodes.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealNodes.forEach(function (n) { io.observe(n); });
    } else {
      revealNodes.forEach(function (n) { n.classList.add('is-revealed'); });
    }


    document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
      var rel = (a.getAttribute('rel') || '').split(' ');
      if (rel.indexOf('noopener') === -1) rel.push('noopener');
      if (rel.indexOf('noreferrer') === -1) rel.push('noreferrer');
      a.setAttribute('rel', rel.join(' ').trim());
    });
  }


  function boot() {
    TapX.initTheme();
    initChrome();
    /* Make sure the demo profile exists before any page reads data. */
    if (window.TapXStorage) {
      try { window.TapXStorage.seedDemo(); } catch (e) {}
    }
    /* Let each page run its own init after the shared chrome is ready. */
    document.dispatchEvent(new CustomEvent('tapx:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
