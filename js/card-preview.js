/**
 * TapX — card-preview.js
 * ------------------------------------------------------------------
 * Live CR80 card designer + print controller.
 *
 * What it does:
 *  - renders the front/back card from the active profile,
 *  - lets the user change text, theme, accent and elements,
 *  - stores the design in localStorage (tapx_card_design),
 *  - triggers a print job that outputs only the card at 85.6 × 53.98 mm.
 *
 * What it does NOT do:
 *  - it does not write NFC chips (that is an NFC app's job),
 *  - it does not upload anything (prototype has no backend).
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var S = window.TapXStorage;
  var DESIGN_KEY = 'tapx_card_design';

  var design = {
    name: '', title: '', school: '', course: '',
    theme: 'midnight', accent: '#5b6cff',
    showSchool: true, showQr: true, showSocial: true, showGuides: true
  };
  var profileUrl = '';

  function $(id) { return document.getElementById(id); }
  function qsa(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ================================================================
     STATE: profile + saved design
     ================================================================ */
  function activeProfile() {
    /* deep link used by "My Cards → Print": card-preview.html?user=maria_santos */
    var wanted = new URLSearchParams(window.location.search).get('user');
    if (wanted && S.getProfile(wanted)) return S.getProfile(wanted);

    var settings = S.getSettings();
    var name = settings.activeProfile;
    var p = (name && S.getProfile(name)) || S.getProfile('juan') ||
            S.getAllProfiles()[0] || null;
    return p;
  }

  function loadDesign() {
    var p = activeProfile();
    if (p) {
      /* stored on the card = profile URL (same as the NFC chip + QR) */
      profileUrl = TapX.tapUrl(p.username);
      design.name = (p.fullName || '').toUpperCase();
      design.title = (p.title || '').toUpperCase();
      design.school = p.school || '';
      design.course = p.course || '';
    }

    try {
      var saved = JSON.parse(localStorage.getItem(DESIGN_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        Object.keys(design).forEach(function (k) {
          if (saved[k] !== undefined && saved[k] !== null) design[k] = saved[k];
        });
      }
    } catch (e) { /* corrupt/absent — keep defaults */ }
  }

  function saveDesign(showFeedback) {
    try {
      localStorage.setItem(DESIGN_KEY, JSON.stringify(design));
      if (showFeedback) TapX.toast('Design saved to this browser', 'success');
    } catch (e) {
      TapX.toast('Storage full — design not saved', 'error');
    }
  }

  /* ================================================================
     RENDER (screen preview)
     ================================================================ */
  function render() {
    /* --- front --- */
    setText('card-front-name', design.name || 'YOUR NAME');
    setText('card-front-title', design.title || 'TITLE / COURSE');

    var schoolLine = [design.school, design.course].filter(Boolean).join(' · ');
    setText('card-front-school', schoolLine || 'SCHOOL');
    $('card-front-school').style.display =
      (design.showSchool && schoolLine) ? '' : 'none';

    /* --- back --- */
    $('card-back-socials').style.display = design.showSocial ? '' : 'none';
    $('card-qr').style.display = design.showQr ? '' : 'none';

    /* --- theme + accent --- */
    applyTheme();
    applyAccent();

    /* --- guides --- */
    qsa('[data-guide]').forEach(function (g) {
      g.hidden = !design.showGuides;
    });

    renderQR();
    syncControls();
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  function applyTheme() {
    var cardClasses = ['pvc-card--snow', 'pvc-card--graphite', 'pvc-card--royal'];
    ['card-front', 'card-back'].forEach(function (id) {
      var card = $(id);
      if (!card) return;
      cardClasses.forEach(function (cls) { card.classList.remove(cls); });
      if (design.theme === 'snow') card.classList.add('pvc-card--snow');
      if (design.theme === 'graphite') card.classList.add('pvc-card--graphite');
      if (design.theme === 'royal') card.classList.add('pvc-card--royal');
    });

    qsa('[data-theme-card]').forEach(function (btn) {
      btn.setAttribute('aria-pressed',
        btn.getAttribute('data-theme-card') === design.theme ? 'true' : 'false');
    });
  }

  function applyAccent() {
    ['card-front', 'card-back'].forEach(function (id) {
      var card = $(id);
      if (card) card.style.setProperty('--card-accent', design.accent);
    });
    qsa('[data-accent]').forEach(function (btn) {
      btn.setAttribute('aria-pressed',
        btn.getAttribute('data-accent') === design.accent ? 'true' : 'false');
    });
  }

  /* small QR on the card back — built once, kept scannable */
  var qrBuilt = false;
  function renderQR() {
    if (!design.showQr || qrBuilt) return;
    var host = $('card-qr');
    if (!host) return;
    qrBuilt = TapX.renderQR(host, profileUrl, 220);
  }

  function syncControls() {
    if ($('cd-name-input').value !== design.name) $('cd-name-input').value = design.name;
    if ($('cd-title-input').value !== design.title) $('cd-title-input').value = design.title;
    if ($('cd-school-input').value !== design.school) $('cd-school-input').value = design.school;
    if ($('cd-course-input').value !== design.course) $('cd-course-input').value = design.course;
    $('opt-school').checked = design.showSchool;
    $('opt-qr').checked = design.showQr;
    $('opt-social').checked = design.showSocial;
    $('opt-guides').checked = design.showGuides;
  }

  /* ================================================================
     PRINTING
     ================================================================ */
  function printSide(side) {
    document.body.classList.remove('print-front', 'print-back', 'print-both');
    document.body.classList.add('print-' + side);

    var label = side === 'both' ? 'front + back' : side;
    TapX.toast('Opening print dialog for the ' + label + '…', 'info');

    /* give the browser a frame to apply classes before printing */
    setTimeout(function () {
      try {
        window.print();
      } catch (e) {
        TapX.toast('Print blocked — use Ctrl+P / Cmd+P', 'error');
      }
    }, 120);
  }

  /* restore normal classes after printing so the preview stays visible */
  window.addEventListener('afterprint', function () {
    document.body.classList.remove('print-front', 'print-back');
    document.body.classList.add('print-both');
  });

  /* ================================================================
     CONTROLS BINDING
     ================================================================ */
  function bindControls() {
    /* text fields — live update */
    var textMap = {
      'cd-name-input': 'name',
      'cd-title-input': 'title',
      'cd-school-input': 'school',
      'cd-course-input': 'course'
    };
    Object.keys(textMap).forEach(function (id) {
      $(id).addEventListener('input', function (e) {
        design[textMap[id]] = e.target.value;
        render();
        saveDesign(false);
      });
    });

    /* theme + accent swatches */
    qsa('[data-theme-card]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        design.theme = btn.getAttribute('data-theme-card');
        applyTheme(); syncControls(); saveDesign(false);
      });
    });
    qsa('[data-accent]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        design.accent = btn.getAttribute('data-accent');
        applyAccent(); saveDesign(false);
      });
    });

    /* element toggles */
    var toggleMap = {
      'opt-school': 'showSchool',
      'opt-qr': 'showQr',
      'opt-social': 'showSocial',
      'opt-guides': 'showGuides'
    };
    Object.keys(toggleMap).forEach(function (id) {
      $(id).addEventListener('change', function (e) {
        design[toggleMap[id]] = e.target.checked;
        if (toggleMap[id] === 'showQr' && e.target.checked) {
          qrBuilt = false;               /* rebuild QR if re-enabled */
        }
        render();
        saveDesign(false);
      });
    });

    /* toolbar */
    $('btn-print-front').addEventListener('click', function () { printSide('front'); });
    $('btn-print-back').addEventListener('click', function () { printSide('back'); });
    $('btn-print-both').addEventListener('click', function () { printSide('both'); });
    $('btn-save').addEventListener('click', function () { saveDesign(true); });
    $('btn-copy-url').addEventListener('click', function () {
      TapX.copy(profileUrl, 'NFC URL copied');
    });
    $('btn-qr-download').addEventListener('click', function () {
      TapX.downloadQR($('card-qr'), 'tapx-card-qr.png');
    });
  }

  /* ================================================================
     BOOT
     ================================================================ */
  function init() {
    if (!S) {
      TapX.toast('Storage unavailable — preview uses default data', 'warn');
    }

    loadDesign();
    bindControls();
    render();

    /* Deep link: dashboard buttons like card-preview.html?print=both */
    var params = new URLSearchParams(window.location.search);
    var wanted = params.get('print');
    if (wanted === 'front' || wanted === 'back' || wanted === 'both') {
      document.body.classList.remove('print-both');
      document.body.classList.add('print-' + wanted);
      setTimeout(function () {
        TapX.toast('Ready to print the ' + wanted +
          ' side — opening print dialog…', 'info');
        setTimeout(function () {
          try { window.print(); } catch (e) {}
        }, 450);
      }, 350);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
