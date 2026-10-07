/**
 * TapX — app.js
 * ------------------------------------------------------------------
 * Shared helpers used by every page: theme toggle, toast notifications,
 * clipboard, QR rendering, safe DOM helpers, NFC capability detection
 * and small UI behaviours (mobile nav, scroll reveal).
 *
 * IMPORTANT — what this app does / does not do:
 *   WEBSITE   → creates and manages the digital profile + its URL.
 *   NFC CARD  → physically stores that URL (written by a separate app).
 *   PRINTING  → prints the visual design onto PVC (card-preview page).
 * The site NEVER claims to write NFC chips itself.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var TapX = window.TapX = window.TapX || {};

  /* ================================================================
     1. SAFE DOM HELPERS
     Everything rendered from user data goes through textContent or
     escapeHtml(). We never assign raw user strings to innerHTML.
     ================================================================ */

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Sets textContent safely (never parses HTML). */
  function setText(el, value) {
    if (el) el.textContent = value === null || value === undefined ? '' : value;
  }

  /** Clears an element safely. */
  function clear(el) {
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
  }

  /** Creates an element with optional className, text and attributes. */
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

  /* ================================================================
     2. URL HELPERS
     Profile URLs are always built from the current origin so the NFC
     URL works whether the site is opened from a domain, a subfolder
     or a local file server. Nothing is hardcoded.
     ================================================================ */

  /**
   * Builds an absolute profile URL for the current location.
   * Works for https hosting, subfolders AND file:// (double-clicking
   * index.html) because it derives the folder from location.href
   * instead of hardcoding a domain.
   * Example: https://site.com/tapx/profile.html?user=juan
   */
  TapX.profileUrl = function (username) {
    var href = String(window.location.href).split('#')[0].split('?')[0];
    var dir = href.substring(0, href.lastIndexOf('/') + 1);
    return dir + 'profile.html?user=' + encodeURIComponent(username);
  };

  /**
   * The URL physically stored on the NFC chip.
   * A tap on any phone opens the profile DIRECTLY (no interstitial).
   * Kept as its own helper so the flow can change in one place later.
   * Example: https://site.com/tapx/profile.html?user=juan
   */
  TapX.tapUrl = function (username) {
    return TapX.profileUrl(username);
  };

  /**
   * Compact URL for printing on the card back:
   *   https://site.com/tapx/profile.html?user=juan -> site.com/tapx/profile.html?user=juan
   *   file:///C:/.../profile.html?user=juan         -> profile.html?user=juan
   */
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

  /* ================================================================
     3. TOAST NOTIFICATIONS
     ================================================================ */
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

    /* keeps lint quiet about unused var in future edits */
    clearTimeout(toastTimer);
  };

  /* ================================================================
     4. CLIPBOARD
     ================================================================ */
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

  /* ================================================================
     5. QR CODES  (library loaded from CDN — see each HTML page)
     Uses qrcodejs with error correction level H where possible.
     ================================================================ */

  /**
   * Renders a QR code into `container`.
   * @returns {boolean} true on success.
   */
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

  /** Downloads the QR code rendered inside `container` as a PNG. */
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

  /* ================================================================
     6. NFC CAPABILITY DETECTION (informational only)
     The core product never depends on Web NFC — this is a status hint.
     ================================================================ */
  TapX.nfcStatus = function () {
    var supported = ('NDEFReader' in window);
    return {
      supported: supported,
      message: supported
        ? 'NFC support detected — some browsers also allow writing URLs directly.'
        : 'NFC writing is normally done using a dedicated NFC writing app.'
    };
  };

  /* ================================================================
     7. THEME — DARK ONLY
     TapX ships a single dark theme: no light mode, no toggle button.
     initTheme() simply pins data-theme="dark" on every page.
     ================================================================ */
  TapX.initTheme = function () {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  };

  /* ================================================================
     8. PAGE CHROME — footer year, mobile nav, scroll reveal
     ================================================================ */
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

    /* reveal-on-scroll (CSS animation, JS only toggles a class) */
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

    /* mark external links as safe */
    document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
      var rel = (a.getAttribute('rel') || '').split(' ');
      if (rel.indexOf('noopener') === -1) rel.push('noopener');
      if (rel.indexOf('noreferrer') === -1) rel.push('noreferrer');
      a.setAttribute('rel', rel.join(' ').trim());
    });
  }

  /* ================================================================
     9. BOOT
     ================================================================ */
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
