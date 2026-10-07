(function () {
  'use strict';

  var S = window.TapXStorage;
  var root = document.getElementById('profile-root');
  var current = null;          
  var currentUrl = '';         

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function icon(faClass) {
    var i = document.createElement('i');
    i.className = faClass;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function showError(title, message, actions) {
    clear(root);
    var box = node('div', 'error-screen');
    box.appendChild(icon('fa-solid fa-circle-exclamation'));
    box.appendChild(node('h1', '', title));
    box.appendChild(node('p', '', message));

    (actions || []).forEach(function (action) {
      if (isHosted() && /(^|\/)(dashboard|index)\.html/.test(action.href)) return;
      var a = document.createElement('a');
      a.className = 'btn btn--primary';
      a.href = action.href;
      a.textContent = action.label;
      box.appendChild(a);
    });

    root.appendChild(box);
    document.title = title + ' — TapX';
  }


  function isHosted() {
    var proto = window.location.protocol;
    if (proto !== 'http:' && proto !== 'https:') return false;
    var host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1' &&
           host !== '::1' && host !== '[::1]';
  }

  function readUsername() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = (params.get('user') || '').trim();
    if (fromQuery) return fromQuery;
    var segments = window.location.pathname.split('/').filter(Boolean);
    var last = segments.length ? segments[segments.length - 1] : '';
    try { last = decodeURIComponent(last); } catch (e) { /* keep raw */ }
    if (last && last.indexOf('.') === -1 && S.USERNAME_RE.test(last)) {
      return last;
    }
    return '';
  }

  function canonicalUrl(username) {
    if (new URLSearchParams(window.location.search).get('user')) {
      return TapX.tapUrl(username);
    }
    return String(window.location.href).split('#')[0];
  }

  function isInactive(profile) {
    return !!profile && (profile.active === false ||
      profile.active === 'false' || profile.active === 0);
  }

  function showInactive() {
    clear(root);
    var box = node('div', 'error-screen');
    box.appendChild(icon('fa-solid fa-pause-circle'));
    box.appendChild(node('h1', '', 'This card is inactive'));
    box.appendChild(node('p', '',
      'The owner has temporarily disabled this TapX card, so the profile ' +
      'is not available right now.'));
    if (!isHosted()) {
      var a = document.createElement('a');
      a.className = 'btn btn--primary';
      a.href = 'dashboard.html';
      a.textContent = 'Enable it in the dashboard';
      box.appendChild(a);
    }
    root.appendChild(box);
    document.title = 'Card inactive — TapX';
  }

  function showNotFound(username) {
    var hosted = isHosted();
    showError('Profile not found',
      hosted
        ? 'No TapX profile exists for "' + username +
          '" — double-check the link, or ask for an up-to-date card.'
        : 'No TapX profile exists for "' + username +
          '" on this device yet. If you just created it, add it from the ' +
          'dashboard — prototype data is stored locally in your browser.',
      [
        { href: 'profile.html?user=juan', label: 'Open demo profile' },
        { href: 'dashboard.html', label: 'Create this profile' }
      ]);
  }

  function sanitizeCloudRow(row) {
    var out = {};
    var TEXT = [
      ['username', 'username'], ['fullName', 'fullname'],
      ['title', 'title'], ['bio', 'bio'],
      ['profileImage', 'profileimage'], ['school', 'school'],
      ['program', 'program'], ['yearLevel', 'yearlevel'],
      ['email', 'email'], ['phone', 'phone'], ['location', 'location'],
      ['instagram', 'instagram'], ['facebook', 'facebook'],
      ['tiktok', 'tiktok'], ['messenger', 'messenger'],
      ['linkedin', 'linkedin'], ['website', 'website'],
      ['portfolio', 'portfolio'], ['cardStatus', 'cardstatus']
    ];
    TEXT.forEach(function (pair) {
      var value = row && row[pair[1]] !== undefined && row[pair[1]] !== null
        ? String(row[pair[1]]) : '';
      var limit = pair[0] === 'profileImage' ? 400000 : 600;
      if (value.length > limit) value = value.slice(0, limit);
      out[pair[0]] = value.trim();
    });
    if (!/^https?:\/\//i.test(out.profileImage) &&
        !/^\.?\//.test(out.profileImage) &&
        !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(out.profileImage) &&
        out.profileImage) {
      out.profileImage = '';
    }
    return S.normalizeSocials(out);
  }

  function notFoundFallback(username, cloudAnswered) {
    var local = S.getProfile(username);
    if (local) {
      if (isInactive(local)) { showInactive(); return; }
      present(local);
      return;
    }
    showNotFound(username, cloudAnswered);
  }

  function present(profile) {
    current = profile;
    currentUrl = canonicalUrl(profile.username);
    render(profile);
    countView(profile.username);
  }

  function loadProfile() {
    var username = readUsername();

    if (!username) {
      showError('No profile selected',
        'This link is missing a username. Try the demo profile instead.',
        [{ href: 'profile.html?user=juan', label: 'Open demo profile' }]);
      return;
    }

    if (!S.USERNAME_RE.test(username)) {
      showError('Invalid profile link',
        '"' + username + '" is not a valid TapX username. Usernames use ' +
        'letters, numbers, underscore and hyphen (3–30 characters).',
        [{ href: 'index.html', label: 'Go to TapX home' }]);
      return;
    }

    var cloud = window.TapXCloud;
    if (cloud && cloud.isReady()) {
      cloud.fetchProfile(username).then(function (res) {
        if (res && res.ok && res.row) {
          var row = sanitizeCloudRow(res.row);
          row.username = row.username || username;
          if (isInactive(res.row)) { showInactive(); return; }
          present(row);
          return;
        }
        notFoundFallback(username, !!(res && res.ok));
      }, function () {
        notFoundFallback(username, false);
      });
      return;
    }

    notFoundFallback(username, false);
  }

  function countView(username) {
    var flag = 'tapx_counted_' + username.toLowerCase();
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
    } catch (e) { /* storage blocked — just count anyway */ }
    try { S.recordView(username); } catch (e) {}
  }


  function render(p) {
    clear(root);
    document.title = p.fullName + ' (@' + p.username + ') — TapX';

    /* ---------- identity card ---------- */
    var card = node('section', 'id-card');
    card.setAttribute('aria-label', 'Profile summary');

    var avatarWrap = node('div', 'avatar-wrap');
    var ring = node('span', 'avatar-ring');
    ring.setAttribute('aria-hidden', 'true');
    var avatar = document.createElement('img');
    avatar.className = 'profile-avatar';
    avatar.alt = 'Photo of ' + p.fullName;
    avatar.loading = 'eager';
    avatar.decoding = 'async';
    /* missing/broken image falls back to the default avatar */
    avatar.onerror = function () {
      if (avatar.src.indexOf('default-avatar.png') === -1) {
        avatar.src = 'assets/default-avatar.png';
      }
    };
    avatar.src = p.profileImage || 'assets/default-avatar.png';
    avatarWrap.appendChild(ring);
    avatarWrap.appendChild(avatar);
    card.appendChild(avatarWrap);

    card.appendChild(node('h1', 'profile-name', p.fullName));
    if (p.title) card.appendChild(node('p', 'profile-title', p.title));
    card.appendChild(node('span', 'profile-handle', '@' + p.username));

    if (p.bio) card.appendChild(node('p', 'profile-bio', p.bio));

    /* verified badge + meta chips */
    var meta = node('div', 'profile-meta');
    meta.appendChild(makeBadge('fa-solid fa-circle-check', 'TapX Verified',
      'badge badge--verified'));
    if (p.location) {
      meta.appendChild(makeBadge('fa-solid fa-location-dot', p.location));
    }
    if (p.title) {
      meta.appendChild(makeBadge('fa-solid fa-id-badge', p.title));
    }
    card.appendChild(meta);

    /* quick actions: share / save contact */
    var actions = node('div', 'action-row');
    actions.appendChild(actionButton('fa-solid fa-share-nodes', 'Share', shareProfile));
    actions.appendChild(actionButton('fa-solid fa-address-card', 'Save Contact', saveContact));
    card.appendChild(actions);

    root.appendChild(card);

    /* ---------- social links ---------- */
    var socials = [
      { field: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', cls: 'ic-instagram' },
      { field: 'tiktok',    label: 'TikTok',    icon: 'fa-brands fa-tiktok',    cls: 'ic-tiktok' },
      { field: 'facebook',  label: 'Facebook',  icon: 'fa-brands fa-facebook',  cls: 'ic-facebook' },
      { field: 'linkedin',  label: 'LinkedIn',  icon: 'fa-brands fa-linkedin',  cls: 'ic-linkedin' },
      { field: 'messenger', label: 'Messenger', icon: 'fa-brands fa-facebook-messenger', cls: 'ic-messenger' }
    ].filter(function (s) { return p[s.field]; });

    if (socials.length) {
      root.appendChild(section('fa-solid fa-share-nodes', 'Social', function (list) {
        socials.forEach(function (s) {
          list.appendChild(linkItem(s.cls, s.icon, s.label,
            prettyHandle(p[s.field], s.field), p[s.field]));
        });
      }));
    }

    /* ---------- contact ---------- */
    var contacts = [];
    if (p.email) {
      contacts.push({ cls: 'ic-mail', icon: 'fa-solid fa-envelope',
        label: 'Email', value: p.email, href: 'mailto:' + p.email });
    }
    if (p.phone) {
      contacts.push({ cls: 'ic-phone', icon: 'fa-solid fa-phone',
        label: 'Phone', value: p.phone,
        href: 'tel:' + p.phone.replace(/[^\d+]/g, '') });
    }
    if (p.messenger) {
      contacts.push({ cls: 'ic-messenger',
        icon: 'fa-brands fa-facebook-messenger', label: 'Messenger',
        value: prettyHandle(p.messenger, 'messenger'), href: p.messenger });
    }
    if (p.location) {
      contacts.push({ cls: 'ic-location', icon: 'fa-solid fa-location-dot',
        label: 'Location', value: p.location,
        href: 'https://maps.google.com/?q=' + encodeURIComponent(p.location) });
    }

    if (contacts.length) {
      root.appendChild(section('fa-solid fa-address-book', 'Contact', function (list) {
        contacts.forEach(function (c) {
          list.appendChild(linkItem(c.cls, c.icon, c.label, c.value, c.href));
        });
      }));
    }

    /* ---------- portfolio / website ---------- */
    var works = [];
    if (p.portfolio) {
      works.push({ cls: 'ic-portfolio', icon: 'fa-solid fa-briefcase',
        label: 'Portfolio', value: prettyUrl(p.portfolio), href: p.portfolio });
    }
    if (p.website) {
      works.push({ cls: 'ic-web', icon: 'fa-solid fa-globe',
        label: 'Website', value: prettyUrl(p.website), href: p.website });
    }
    if (works.length) {
      root.appendChild(section('fa-solid fa-briefcase', 'Portfolio', function (list) {
        works.forEach(function (w) {
          list.appendChild(linkItem(w.cls, w.icon, w.label, w.value, w.href));
        });
      }));
    }

    /* ---------- school information ---------- */
    if (p.school || p.program || p.yearLevel) {
      var infoSection = node('section', 'p-section');
      infoSection.appendChild(sectionTitle('fa-solid fa-graduation-cap', 'Education'));
      var dl = node('dl', 'info-grid');
      addInfoRow(dl, 'School', p.school);
      addInfoRow(dl, 'Program', p.program);
      addInfoRow(dl, 'Year Level', p.yearLevel);
      infoSection.appendChild(dl);
      root.appendChild(infoSection);
    }
  }


  function makeBadge(faClass, text, extraClass) {
    var b = node('span', extraClass || 'badge');
    b.appendChild(icon(faClass));
    b.appendChild(document.createTextNode(' ' + text));
    return b;
  }

  function actionButton(faClass, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'action-btn';
    b.appendChild(icon(faClass));
    b.appendChild(document.createTextNode(label));
    b.addEventListener('click', onClick);
    return b;
  }

  function sectionTitle(faClass, title) {
    var h = node('h2', 'p-section__title');
    h.appendChild(icon(faClass));
    h.appendChild(document.createTextNode(title));
    return h;
  }

  /** Builds a link section; builder receives the list container. */
  function section(faClass, title, builder) {
    var sec = node('section', 'p-section');
    sec.appendChild(sectionTitle(faClass, title));
    var list = node('div', 'link-list');
    builder(list);
    sec.appendChild(list);
    return sec;
  }

  function linkItem(iconCls, faClass, label, value, href) {
    var a = document.createElement('a');
    a.className = 'link-item';
    a.href = href;
    a.rel = 'noopener noreferrer';
    if (/^https?:/i.test(href)) {
      a.target = '_blank';
      a.setAttribute('aria-label', label + ': ' + value + ' (opens in a new tab)');
    }

    var ic = node('span', 'link-item__icon ' + iconCls);
    ic.appendChild(icon(faClass));
    a.appendChild(ic);

    var txt = node('span', 'link-item__text');
    txt.appendChild(node('p', 'link-item__label', label));
    txt.appendChild(node('p', 'link-item__value', value));
    a.appendChild(txt);

    a.appendChild(icon('fa-solid fa-arrow-up-right-from-square link-item__go'));
    return a;
  }

  function addInfoRow(dl, term, value) {
    if (!value) return;
    var row = node('div', 'info-row');
    var dt = document.createElement('dt');
    dt.textContent = term;
    var dd = document.createElement('dd');
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    dl.appendChild(row);
  }

  function prettyUrl(url) {
    return String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  function prettyHandle(value, field) {
    var v = String(value);
    if (/^https?:/i.test(v)) {
      try {
        var u = new URL(v);
        var last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
        return (field === 'tiktok' ? '@' : '') + last;
      } catch (e) { return v; }
    }
    return v;
  }

  function shareProfile() {
    var data = {
      title: current.fullName + ' — TapX',
      text: 'TapX profile of ' + current.fullName + ' (@' + current.username + ')',
      url: currentUrl
    };

    if (navigator.share) {
      navigator.share(data).catch(function () { /* user cancelled */ });
      return;
    }
    TapX.copy(currentUrl, 'Profile link copied');
  }

  function saveContact() {
    var p = current;
    var lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:' + sanitizeVCard(p.fullName),
      'N:' + sanitizeVCard(p.fullName) + ';;;;',
      'TITLE:' + sanitizeVCard(p.title),
      'ORG:' + sanitizeVCard(p.school),
      'EMAIL;TYPE=INTERNET:' + sanitizeVCard(p.email),
      'TEL;TYPE=CELL:' + sanitizeVCard(p.phone),
      'URL:' + sanitizeVCard(currentUrl),
      'NOTE:' + sanitizeVCard(p.bio),
      'ADR;TYPE=WORK:;;;' + sanitizeVCard(p.location) + ';;;;',
      'END:VCARD'
    ].filter(function (l) { return !/:$/.test(l) && l.indexOf('::') === -1; });

    try {
      var blob = new Blob([lines.join('\r\n')],
        { type: 'text/vcard;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = p.username + '-tapx.vcf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      TapX.toast('Contact file downloaded', 'success');
    } catch (e) {
      TapX.toast('Could not build contact file', 'error');
    }
  }

  function sanitizeVCard(value) {
    return String(value || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/([,;\\])/g, '\\$1');
  }


  function init() {
    var year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    if (!S) {
      showError('Storage unavailable',
        'Your browser blocked local storage, so TapX profiles cannot be ' +
        'loaded. Enable storage (or try another browser) and reload.',
        [{ href: 'index.html', label: 'Back to TapX' }]);
      return;
    }
    loadProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
