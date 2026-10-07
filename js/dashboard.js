/**
 * TapX — dashboard.js
 * ------------------------------------------------------------------
 * Powers dashboard.html: panel routing, the profile editor, social
 * link normalisation, NFC URL panel and settings.
 *
 * All profile data comes from / goes to TapXStorage (localStorage).
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var S = window.TapXStorage;

  var PANEL_TITLES = {
    overview: 'Dashboard',
    cards: 'My Cards',
    profile: 'My Profile',
    social: 'Social Links',
    card: 'Card Design',
    nfc: 'NFC Setup',
    settings: 'Settings'
  };

  var state = {
    active: null,          // profile object being edited
    image: ''              // pending profile image dataURL
  };

  /* ================================================================
     UTILITIES
     ================================================================ */
  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value === undefined || value === null ? '' : value;
  }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function activeUsername() {
    var settings = S.getSettings();
    var name = settings.activeProfile;
    if (name && S.getProfile(name)) return name;
    return 'juan';
  }

  function setActive(username) {
    state.active = S.getProfile(username) || S.getProfile('juan') ||
      S.getAllProfiles()[0] || null;
    state.image = state.active ? state.active.profileImage : '';
    S.saveSettings({ activeProfile: state.active ? state.active.username : '' });
  }

  /* ================================================================
     PANEL ROUTING (hash based, works without a server)
     ================================================================ */
  function showPanel(name, pushHash) {
    if (!PANEL_TITLES[name]) name = 'overview';

    qsa('.panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'panel-' + name);
    });
    qsa('#side-nav a[data-panel]').forEach(function (a) {
      var on = a.getAttribute('data-panel') === name;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    setText('page-title', PANEL_TITLES[name]);
    document.title = PANEL_TITLES[name] + ' — TapX';

    if (pushHash && window.location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }

    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    /* lazy work per panel */
    if (name === 'overview' || name === 'card') renderQrTiles();
    if (name === 'cards') renderCards();
    if (name === 'settings') renderSettings();
    if (name === 'social') renderSocialPreview();
  }

  function initRouting() {
    qsa('#side-nav a[data-panel]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        showPanel(a.getAttribute('data-panel'), true);
      });
    });
    qsa('[data-panel-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        showPanel(a.getAttribute('data-panel-link'), true);
      });
    });
    window.addEventListener('hashchange', function () {
      showPanel((window.location.hash || '#overview').slice(1), false);
    });
    showPanel((window.location.hash || '#overview').slice(1), false);
  }

  /* ================================================================
     SIDEBAR (mobile drawer)
     ================================================================ */
  function openSidebar() {
    $('sidebar').classList.add('is-open');
    $('sidebar-backdrop').classList.add('is-open');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('is-open');
    $('sidebar-backdrop').classList.remove('is-open');
  }

  /* ================================================================
     OVERVIEW
     ================================================================ */
  function renderOverview() {
    var p = state.active;
    if (!p) return;

    setText('ov-name', ', ' + p.fullName.split(' ')[0]);
    setText('ov-fullname', p.fullName);
    setText('ov-title-line', [p.title, p.school].filter(Boolean).join(' · ') || '—');
    setText('ov-handle', '@' + p.username);

    /* The URL physically stored on the NFC chip = the profile URL. */
    var url = TapX.tapUrl(p.username);
    setText('ov-url', url);

    var avatar = $('ov-avatar');
    avatar.src = p.profileImage || 'assets/default-avatar.png';
    avatar.onerror = function () { avatar.src = 'assets/default-avatar.png'; };

    var links = ['instagram', 'facebook', 'tiktok', 'messenger', 'linkedin',
                 'website', 'portfolio', 'email', 'phone']
      .filter(function (k) { return p[k]; }).length;

    setText('stat-views', String(S.getViews(p.username) || p.views || 0));
    setText('stat-links', String(links));
    setText('stat-cards', String(S.getAllProfiles().length));

    /* mini card preview on card panel */
    setText('cd-name', (p.fullName || 'YOUR NAME').toUpperCase());
    setText('cd-title', (p.title || 'TITLE / COURSE').toUpperCase());

    var viewBtn = $('view-profile-btn');
    if (viewBtn) viewBtn.href = 'profile.html?user=' + encodeURIComponent(p.username);
  }

  /* ================================================================
     CARD QR (mini preview on the card panel)
     The small QR holds the SAME URL as the NFC chip, so tapping and
     scanning both open the profile directly.
     ================================================================ */
  function renderQrTiles() {
    var p = state.active;
    if (!p) return;
    var url = TapX.tapUrl(p.username);

    var targets = [
      { el: $('cd-qr'), size: 120 }
    ];
    targets.forEach(function (t) {
      if (!t.el) return;
      /* rebuild only when empty (QRCode lib appends nodes) */
      if (!t.el.firstChild) TapX.renderQR(t.el, url, t.size);
    });
  }

  /* ================================================================
     PROFILE EDITOR
     ================================================================ */
  var PROFILE_FIELDS = ['fullName', 'username', 'title', 'bio', 'school',
                        'course', 'yearLevel', 'email', 'phone', 'location',
                        'website', 'portfolio'];

  function fillProfileForm() {
    var p = state.active;
    if (!p) return;
    PROFILE_FIELDS.forEach(function (f) {
      var input = $('pf-' + f);
      if (input) input.value = p[f] || '';
    });
    setText('bio-count', String((p.bio || '').length));

    var img = $('pf-avatar');
    img.src = p.profileImage || 'assets/default-avatar.png';
    img.onerror = function () { img.src = 'assets/default-avatar.png'; };
    state.image = p.profileImage || '';
    clearErrors($('profile-form'));
  }

  function clearErrors(form) {
    qsa('.field.has-error', form).forEach(function (f) { f.classList.remove('has-error'); });
    qsa('.error-msg', form).forEach(function (m) { m.textContent = ''; });
  }

  function showErrors(form, errors) {
    clearErrors(form);
    var first = null;
    Object.keys(errors).forEach(function (field) {
      var wrap = qs('[data-field="' + field + '"]', form);
      if (!wrap) return;
      wrap.classList.add('has-error');
      var msg = qs('.error-msg', wrap);
      if (msg) msg.textContent = errors[field];
      if (!first) first = wrap.querySelector('input, textarea');
    });
    if (first) first.focus();
  }

  function readForm(form) {
    var out = {};
    qsa('input, textarea, select', form).forEach(function (input) {
      if (input.name) out[input.name] = String(input.value || '').trim();
    });
    return out;
  }

  function saveProfileForm(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var data = readForm(form);
    data.profileImage = state.image || '';

    var previous = state.active ? state.active.username : '';
    var result = S.saveProfile(data, { ignoreUsername: previous });

    if (!result.ok) {
      showErrors(form, result.errors || {});
      TapX.toast('Please fix the highlighted fields', 'error');
      return;
    }

    setActive(result.profile.username);
    clearErrors(form);
    refreshAll();
    TapX.toast('Profile saved', 'success');
    showPanel('social', true);
  }

  /* ---------- avatar upload (resize to keep localStorage small) ----- */
  function handleImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      TapX.toast('Please choose an image file', 'error');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      TapX.toast('Image too large (max 6 MB)', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () { TapX.toast('Could not read that file', 'error'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { TapX.toast('Could not load that image', 'error'); };
      img.onload = function () {
        try {
          var size = 256;
          var canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          var ctx = canvas.getContext('2d');
          /* centre-crop to a square */
          var min = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2,
                        min, min, 0, 0, size, size);
          state.image = canvas.toDataURL('image/jpeg', 0.82);
          $('pf-avatar').src = state.image;
          /* photo is stored right away - no Save click needed */
          if (state.active) {
            autosaveNow('profile');
            TapX.toast('Photo saved', 'success');
          } else {
            TapX.toast('Photo ready — it will be saved with the profile', 'info');
          }
        } catch (err) {
          TapX.toast('Could not process that image', 'error');
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ================================================================
     SOCIAL LINKS
     ================================================================ */
  var SOCIAL_FIELDS = ['instagram', 'tiktok', 'facebook', 'messenger', 'linkedin'];

  function fillSocialForm() {
    var p = state.active;
    if (!p) return;
    SOCIAL_FIELDS.forEach(function (f) {
      var input = $('so-' + f);
      if (input) input.value = p[f] || '';
    });
    renderSocialPreview();
  }

  function renderSocialPreview() {
    var host = $('social-preview');
    if (!host) return;
    var draft = readForm($('social-form'));
    var normalised = S.normalizeSocials(draft);

    while (host.firstChild) host.removeChild(host.firstChild);

    SOCIAL_FIELDS.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'social-preview__row';

      var label = document.createElement('span');
      label.textContent = f.charAt(0).toUpperCase() + f.slice(1);

      var value = document.createElement('span');
      value.textContent = normalised[f]
        ? normalised[f].replace(/^https?:\/\//, '')
        : 'not set';

      row.appendChild(label);
      row.appendChild(value);
      host.appendChild(row);
    });
  }

  function saveSocialForm(e) {
    e.preventDefault();
    var p = state.active;
    if (!p) return;

    var draft = readForm(e.currentTarget);
    var merged = Object.assign({}, p, draft);
    var result = S.saveProfile(merged, { ignoreUsername: p.username });

    if (!result.ok) {
      showErrors(e.currentTarget, result.errors || {});
      TapX.toast('Could not save social links', 'error');
      return;
    }
    setActive(result.profile.username);
    clearErrors(e.currentTarget);
    refreshAll();
    TapX.toast('Social links saved', 'success');
    showPanel('card', true);
  }

  /* ================================================================
     AUTO-SAVE
     Every keystroke is written to storage after a short pause, so
     closing the browser never loses typed work. The Save buttons
     still work - they just give a toast and move to the next step.
     ================================================================ */
  var AUTOSAVE_DELAY = 700;               /* ms of quiet before saving */
  var autosaveTimers = { profile: null, social: null };

  function setAutosaveStatus(id, message, ok) {
    var el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-ok', ok !== false);
    el.classList.add('is-on');
    if (el._t) clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.classList.remove('is-on');
    }, 3000);
  }

  function queueAutosave(kind) {
    if (autosaveTimers[kind]) clearTimeout(autosaveTimers[kind]);
    autosaveTimers[kind] = setTimeout(function () {
      autosaveTimers[kind] = null;
      autosaveNow(kind);
    }, AUTOSAVE_DELAY);
  }

  /* Write pending work immediately (used when the tab is closed). */
  function flushAutosave() {
    ['profile', 'social'].forEach(function (kind) {
      if (autosaveTimers[kind]) {
        clearTimeout(autosaveTimers[kind]);
        autosaveTimers[kind] = null;
        autosaveNow(kind, true);
      }
    });
  }

  /* Non-form displays only - never touches the inputs the user is
     typing in, so the caret never jumps. */
  function refreshDisplays() {
    renderOverview();
    renderNfc();
    renderCards();
    renderSettings();
    updateStoragePill();
  }

  function autosaveNow(kind, force) {
    if (!S) return false;
    var form = kind === 'profile' ? $('profile-form') : $('social-form');
    if (!form) return false;

    var data = readForm(form);
    var p = state.active;

    /* ---- brand new profile (no active one yet) ------------------
       Wait until the username field is not being typed in, so a
       half-typed name never becomes its own profile. */
    if (!p) {
      if (kind !== 'profile') return false;
      if (!force && document.activeElement &&
          document.activeElement.id === 'pf-username') return false;
      data.profileImage = state.image || '';
      var created = S.saveProfile(data, {});
      if (!created.ok) return false;         /* not complete yet - keep waiting */
      setActive(created.profile.username);
      refreshDisplays();
      setAutosaveStatus('pf-autosave-status', 'Profile created - saved');
      return true;
    }

    /* ---- existing profile ------------------------------------- */
    if (kind === 'profile') {
      /* the username IS the NFC URL - changing it needs the Save
         button, but everything else still auto-saves */
      var renamed = data.username !== p.username;
      data.username = p.username;
      data.profileImage = state.image || p.profileImage || '';
      var merged = Object.assign({}, p, data);
      var result = S.saveProfile(merged, { ignoreUsername: p.username });
      if (!result.ok) return false;
      state.active = result.profile;
      state.image = result.profile.profileImage || '';
      refreshDisplays();
      setAutosaveStatus('pf-autosave-status',
        renamed ? 'Saved - press Save profile to change username'
                : 'Saved automatically');
      return true;
    }

    /* social links - merge into the active profile */
    var mergedSocial = Object.assign({}, p, data);
    var socialResult = S.saveProfile(mergedSocial, { ignoreUsername: p.username });
    if (!socialResult.ok) return false;
    state.active = socialResult.profile;
    refreshDisplays();
    setAutosaveStatus('so-autosave-status', 'Saved automatically');
    return true;
  }

  /* ================================================================
     NFC PANEL
     ================================================================ */
  function renderNfc() {
    var p = state.active;
    if (!p) return;
    var url = TapX.tapUrl(p.username);

    setText('nfc-url', url);
    var test = $('nfc-test');
    if (test) test.href = 'profile.html?user=' + encodeURIComponent(p.username);

    var status = TapX.nfcStatus();
    setText('nfc-status', status.message);

    var guide = $('nfc-guide');
    if (guide) guide.onclick = function () { window.location.href = 'setup.html'; };

    var copy = $('nfc-copy');
    if (copy) copy.onclick = function () { TapX.copy(url, 'NFC URL copied'); };
  }

  /* ================================================================
     MY CARDS — the production list: one row per customer card.
     You are the only person using this website, but every customer
     you print for gets their own profile / URL / status.
     ================================================================ */
  var STATUS_LABELS = { draft: 'Draft', printed: 'Printed', issued: 'Issued' };

  function renderCards() {
    var host = $('cards-list');
    if (!host) return;
    var all = S.getAllProfiles();

    function count(status) {
      return all.filter(function (p) { return p.cardStatus === status; }).length;
    }
    setText('cards-total', String(all.length));
    setText('cards-printed', String(count('printed')));
    setText('cards-issued', String(count('issued')));

    while (host.firstChild) host.removeChild(host.firstChild);

    if (!all.length) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No cards yet — create the first customer card.';
      host.appendChild(empty);
      return;
    }

    all.forEach(function (p) { host.appendChild(buildCardRow(p)); });
  }

  function buildCardRow(p) {
    var status = STATUS_LABELS[p.cardStatus] ? p.cardStatus : 'draft';

    var row = document.createElement('div');
    row.className = 'card-row';
    row.setAttribute('data-user', p.username);

    var img = document.createElement('img');
    img.className = 'card-row__thumb';
    img.src = p.profileImage || 'assets/default-avatar.png';
    img.alt = '';
    img.onerror = function () { img.src = 'assets/default-avatar.png'; };
    row.appendChild(img);

    var id = document.createElement('div');
    id.className = 'card-row__id';
    var name = document.createElement('strong');
    name.textContent = p.fullName;
    var handle = document.createElement('span');
    handle.textContent = '@' + p.username;
    id.appendChild(name);
    id.appendChild(handle);
    row.appendChild(id);

    var url = document.createElement('code');
    url.className = 'card-row__url';
    url.textContent = TapX.shortUrl(TapX.tapUrl(p.username));
    row.appendChild(url);

    var pill = document.createElement('span');
    pill.className = 'status-pill status-pill--' + status;
    pill.textContent = STATUS_LABELS[status];
    row.appendChild(pill);

    var actions = document.createElement('div');
    actions.className = 'card-row__actions';

    var view = document.createElement('a');
    view.className = 'btn btn--soft btn--sm';
    view.href = 'profile.html?user=' + encodeURIComponent(p.username);
    view.target = '_blank';
    view.rel = 'noopener noreferrer';
    view.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> View';
    actions.appendChild(view);

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--soft btn--sm';
    copy.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i> Copy link';
    copy.addEventListener('click', function () {
      TapX.copy(TapX.tapUrl(p.username), 'Card link copied for @' + p.username);
    });
    actions.appendChild(copy);

    var print = document.createElement('a');
    print.className = 'btn btn--soft btn--sm';
    print.href = 'card-preview.html?user=' + encodeURIComponent(p.username);
    print.innerHTML = '<i class="fa-solid fa-print" aria-hidden="true"></i> Print';
    actions.appendChild(print);

    var select = document.createElement('select');
    select.className = 'input card-row__status';
    select.setAttribute('aria-label', 'Production status for @' + p.username);
    ['draft', 'printed', 'issued'].forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = STATUS_LABELS[value];
      if (value === status) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      var result = S.saveProfile(
        Object.assign({}, p, { cardStatus: select.value }));
      if (result.ok) {
        refreshAll();
        TapX.toast('@' + p.username + ' set to ' +
          STATUS_LABELS[select.value], 'success');
      } else {
        TapX.toast('Could not update the status', 'error');
      }
    });
    actions.appendChild(select);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--danger btn--sm';
    del.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i> Delete';
    del.addEventListener('click', function () {
      if (!window.confirm('Permanently delete the card for @' + p.username +
          '? This cannot be undone.')) return;
      S.deleteProfile(p.username);
      if (state.active && state.active.username === p.username) {
        var rest = S.getAllProfiles();
        if (rest.length) {
          setActive(rest[0].username);
        } else {
          state.active = null;
          state.image = '';
          S.saveSettings({ activeProfile: '' });
        }
      }
      refreshAll();
      TapX.toast('Card permanently deleted', 'success');
    });
    actions.appendChild(del);

    row.appendChild(actions);
    return row;
  }

  /** Shared by Settings → "New profile" and My Cards → "Create card". */
  function startNewProfile() {
    state.active = null;
    state.image = '';
    showPanel('profile', true);
    $('profile-form').reset();
    clearErrors($('profile-form'));
    $('pf-avatar').src = 'assets/default-avatar.png';
    $('pf-fullName').focus();
    TapX.toast('Fill in the customer details, then save', 'info');
  }

  /* ================================================================
     SETTINGS
     ================================================================ */
  function renderSettings() {
    var select = $('st-active');
    if (!select) return;
    while (select.firstChild) select.removeChild(select.firstChild);

    S.getAllProfiles().forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.username;
      opt.textContent = p.fullName + ' (@' + p.username + ')';
      if (state.active && p.username === state.active.username) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function initSettings() {
    $('st-active').addEventListener('change', function (e) {
      setActive(e.target.value);
      refreshAll();
      TapX.toast('Switched to @' + e.target.value);
    });

    $('st-new').addEventListener('click', startNewProfile);

    $('st-export').addEventListener('click', function () {
      try {
        var data = JSON.stringify(S.getAllProfiles(), null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tapx-profiles.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        TapX.toast('Profiles exported', 'success');
      } catch (e) {
        TapX.toast('Export failed', 'error');
      }
    });

    $('st-reseed').addEventListener('click', function () {
      S.clearRemoved();              /* user asked for the demos back */
      S.seedDemo();
      setActive('juan');
      refreshAll();
      TapX.toast('Demo cards restored', 'success');
    });

    $('st-delete').addEventListener('click', function () {
      if (!state.active) return;
      if (!window.confirm('Delete @' + state.active.username +
          '? This cannot be undone.')) return;
      S.deleteProfile(state.active.username);
      var rest = S.getAllProfiles();
      if (rest.length) {
        setActive(rest[0].username);
      } else {
        /* every card is gone - start from an empty dashboard */
        state.active = null;
        state.image = '';
        S.saveSettings({ activeProfile: '' });
      }
      refreshAll();
      showPanel('overview', true);
      TapX.toast('Profile deleted', 'success');
    });

    $('st-reset').addEventListener('click', function () {
      if (!window.confirm('Erase ALL TapX data stored in this browser?')) return;
      try {
        ['tapx_profiles', 'tapx_views', 'tapx_settings', 'tapx_seeded_v1',
         'tapx_card_design', 'tapx_removed',
         /* legacy keys from the old TapID branding, just in case */
         'tapid_profiles', 'tapid_views', 'tapid_settings', 'tapid_seeded_v1',
         'tapid_card_design'
        ].forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
      S.seedDemo();
      setActive('juan');
      refreshAll();
      showPanel('overview', true);
      TapX.toast('All data erased — demo restored', 'success');
    });
  }

  /* ================================================================
     GENERIC COPY BUTTONS  (data-copy-target="elementId")
     ================================================================ */
  function initCopyButtons() {
    qsa('[data-copy-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = $(btn.getAttribute('data-copy-target'));
        if (target) TapX.copy(target.textContent.trim(), 'Copied to clipboard');
      });
    });
  }

  /* ================================================================
     REFRESH EVERYTHING AFTER A DATA CHANGE
     ================================================================ */
  function refreshAll() {
    if (!state.active) setActive(activeUsername());
    renderOverview();
    renderQrTiles();
    renderNfc();
    renderCards();
    fillProfileForm();
    fillSocialForm();
    renderSettings();
    updateStoragePill();
  }

  function updateStoragePill() {
    var pill = $('storage-pill');
    if (!pill) return;
    if (S.isPersistent) {
      setText('storage-text', 'localStorage active');
    } else {
      pill.classList.add('is-memory');
      setText('storage-text', 'memory mode (storage blocked)');
    }
  }

  /* ================================================================
     BOOT
     ================================================================ */
  function init() {
    if (!S) {
      document.getElementById('main-content').innerHTML =
        '<div class="error-screen"><h1>Storage unavailable</h1>' +
        '<p>Your browser blocked local storage, which this prototype needs.' +
        ' Enable it and reload.</p></div>';
      return;
    }

    /* sidebar */
    qsa('[data-sidebar-open]').forEach(function (b) {
      b.addEventListener('click', openSidebar);
    });
    qsa('[data-sidebar-close]').forEach(function (b) {
      b.addEventListener('click', closeSidebar);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSidebar();
    });

    setActive(activeUsername());

    initRouting();
    initCopyButtons();
    initSettings();

    var cardNew = $('card-new');
    if (cardNew) cardNew.addEventListener('click', startNewProfile);

    /* forms */
    $('profile-form').addEventListener('submit', saveProfileForm);
    $('social-form').addEventListener('submit', saveSocialForm);

    /* auto-save: type once, stored forever (survives closing the tab) */
    $('profile-form').addEventListener('input', function () { queueAutosave('profile'); });
    $('profile-form').addEventListener('change', function () { queueAutosave('profile'); });
    $('social-form').addEventListener('input', function () { queueAutosave('social'); });

    /* write pending changes the moment the tab is closed / hidden */
    window.addEventListener('pagehide', flushAutosave);
    window.addEventListener('beforeunload', flushAutosave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushAutosave();
    });

    $('pf-bio').addEventListener('input', function (e) {
      setText('bio-count', String(e.target.value.length));
    });

    $('pf-image-file').addEventListener('change', function (e) {
      handleImageFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    $('pf-image-reset').addEventListener('click', function () {
      state.image = '';
      $('pf-avatar').src = 'assets/default-avatar.png';
      if (state.active) autosaveNow('profile');
      TapX.toast('Photo removed', 'info');
    });

    /* live social preview */
    qsa('#social-form input').forEach(function (input) {
      input.addEventListener('input', renderSocialPreview);
    });

    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
