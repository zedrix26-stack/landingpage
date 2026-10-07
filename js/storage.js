(function () {
  'use strict';

  var KEYS = {
    profiles: 'tapx_profiles',
    views: 'tapx_views',
    settings: 'tapx_settings',
    seeded: 'tapx_seeded_v1',
    removed: 'tapx_removed'       /* usernames the user deleted for good */
  };

  /* In-memory mirror. If localStorage is blocked (private mode, iframe
     sandbox...) the app still works for the current session. */
  var memory = {};

  function storageAvailable() {
    try {
      var probe = '__tapx_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  var HAS_LS = storageAvailable();

  /* ---------- one-time migration from the old tapid_* keys ----------
     Earlier builds stored everything under "tapid_*". The keys are now
     "tapx_*" (brand rename). Copy old data over so nothing the user
     already saved is lost, then delete the legacy keys. */
  var LEGACY_KEYS = {
    tapid_profiles: 'tapx_profiles',
    tapid_views: 'tapx_views',
    tapid_settings: 'tapx_settings',
    tapid_seeded_v1: 'tapx_seeded_v1',
    tapid_card_design: 'tapx_card_design'
  };

  function migrateLegacyKeys() {
    if (!HAS_LS) return;
    try {
      Object.keys(LEGACY_KEYS).forEach(function (oldKey) {
        var raw = window.localStorage.getItem(oldKey);
        if (raw === null) return;
        var fresh = LEGACY_KEYS[oldKey];

        if (window.localStorage.getItem(fresh) === null) {
          window.localStorage.setItem(fresh, raw);
        }
        window.localStorage.removeItem(oldKey);
      });
    } catch (e) {}
  }
  migrateLegacyKeys();

  /* ---------- cleanup of stale demo leftovers ----------
     The demo profile "zedrix" is now an official seeded demo account
     (see seedDemo), so it is kept. Only fix settings that point at a
     profile which no longer exists. */
  function fixBrokenActiveProfile() {
    if (!HAS_LS) return;
    try {
      var sraw = window.localStorage.getItem(KEYS.settings);
      if (sraw) {
        var st = JSON.parse(sraw);
        if (st && st.activeProfile && !profileExists(st.activeProfile)) {
          st.activeProfile = 'juan';
          window.localStorage.setItem(KEYS.settings, JSON.stringify(st));
        }
      }
    } catch (e) {}
  }
  fixBrokenActiveProfile();

  function readRaw(key, fallback) {
    if (!HAS_LS) {
      return Object.prototype.hasOwnProperty.call(memory, key)
        ? memory[key]
        : fallback;
    }
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeRaw(key, value) {
    var serialized = JSON.stringify(value);
    if (!HAS_LS) {
      memory[key] = serialized;
      return false;
    }
    try {
      window.localStorage.setItem(key, serialized);
      return true;
    } catch (e) {
      /* quota exceeded or storage disabled — fall back to memory so the
         current session keeps working, and report the problem. */
      memory[key] = serialized;
      return false;
    }
  }

  var USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function validateProfile(profile, options) {
    options = options || {};
    var errors = {};
    var username = String(profile.username || '').trim();

    if (!String(profile.fullName || '').trim()) {
      errors.fullName = 'Full name is required.';
    }
    if (!username) {
      errors.username = 'Username is required.';
    } else if (!USERNAME_RE.test(username)) {
      errors.username =
        'Use 3–30 characters: letters, numbers, underscore or hyphen only.';
    } else if (
      !options.allowExisting &&
      profileExists(username) &&
      !(options.ignoreUsername &&
        options.ignoreUsername.toLowerCase() === username.toLowerCase())
    ) {
      errors.username = 'That username is already taken.';
    }

    if (profile.email && !EMAIL_RE.test(String(profile.email).trim())) {
      errors.email = 'Enter a valid email address.';
    }

    ['website', 'portfolio', 'instagram', 'facebook', 'tiktok',
     'messenger', 'linkedin'].forEach(function (field) {
      var value = String(profile[field] || '').trim();
      if (value && value.indexOf('http') !== 0 && value.indexOf('/') !== 0) {
        /* bare usernames are allowed here — normalizeSocials() turns them
           into full URLs later. Only reject obvious junk. */
        if (value.indexOf(' ') !== -1) {
          errors[field] = 'Enter a username or a full URL (no spaces).';
        }
      }
    });

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

    var SOCIAL_RULES = {
    instagram: { host: 'https://instagram.com/', strip: /^@?/ },
    facebook: { host: 'https://facebook.com/', strip: /^@?/ },
    tiktok: { host: 'https://tiktok.com/@', strip: /^@+/ },
    linkedin: { host: 'https://linkedin.com/in/', strip: /^@?/ },
    messenger: { host: 'https://m.me/', strip: /^@?/ },
    website: { host: '', strip: '' },
    portfolio: { host: '', strip: '' }
  };

  function normalizeSocials(profile) {
    var out = {};
    Object.keys(profile || {}).forEach(function (k) { out[k] = profile[k]; });

    Object.keys(SOCIAL_RULES).forEach(function (field) {
      var rule = SOCIAL_RULES[field];
      var value = String(out[field] || '').trim();
      if (!value) return;
      value = value.replace(rule.strip, '');
      if (/^https?:\/\//i.test(value)) {
        out[field] = value;                        // already a full URL
      } else if (rule.host && value) {
        out[field] = rule.host + value.replace(/^@/, ''); // username -> URL
      } else {
        out[field] = 'https://' + value.replace(/^\/+/, ''); // mysite.com
      }
    });

    return out;
  }

  function getAllProfiles() {
    var list = readRaw(KEYS.profiles, []);
    return Array.isArray(list) ? list : [];
  }

  function profileExists(username) {
    var needle = String(username || '').toLowerCase();
    return getAllProfiles().some(function (p) {
      return String(p.username || '').toLowerCase() === needle;
    });
  }

  function getProfile(username) {
    var needle = String(username || '').trim().toLowerCase();
    if (!needle) return null;
    var found = getAllProfiles().filter(function (p) {
      return String(p.username || '').toLowerCase() === needle;
    });
    return found.length ? found[0] : null;
  }

    function saveProfile(profile, options) {
    options = options || {};
    var clean = normalizeSocials(sanitizeProfile(profile));
    clean.username = String(clean.username || '').trim();
    clean.fullName = String(clean.fullName || '').trim();

    var result = validateProfile(clean, {
      ignoreUsername: options.ignoreUsername || clean.username
    });
    if (!result.valid) {
      return { ok: false, errors: result.errors };
    }

    var list = getAllProfiles();
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].username.toLowerCase() === clean.username.toLowerCase()) {
        index = i;
        break;
      }
    }

    /* Editing a profile from the "My Profile" form does not touch the
       production status — keep the customer's card state intact. */
    if (index >= 0 && !profile.cardStatus) {
      clean.cardStatus = list[index].cardStatus || 'draft';
    }

    /* Same for the active switch: the edit forms never send it, so a
       disabled card stays disabled until explicitly toggled back. */
    if (index >= 0 && profile.active === undefined) {
      clean.active = list[index].active !== false;
    }

    if (index >= 0) {
      clean.createdAt = list[index].createdAt || Date.now();
      clean.updatedAt = Date.now();
      clean.views = list[index].views || 0;
      list[index] = clean;
    } else {
      clean.createdAt = Date.now();
      clean.updatedAt = Date.now();
      clean.views = 0;
      list.push(clean);
    }

    writeRaw(KEYS.profiles, list);
    document.dispatchEvent(new CustomEvent('tapx:profiles-changed'));
    return { ok: true, profile: clean };
  }

  function deleteProfile(username) {
    var needle = String(username || '').toLowerCase();
    var list = getAllProfiles();
    var next = list.filter(function (p) {
      return String(p.username || '').toLowerCase() !== needle;
    });
    if (next.length === list.length) return false;
    writeRaw(KEYS.profiles, next);

    var removed = readRaw(KEYS.removed, []) || [];
    if (removed.indexOf(needle) === -1) {
      removed.push(needle);
      writeRaw(KEYS.removed, removed);
    }

    var views = readRaw(KEYS.views, {}) || {};
    if (views.hasOwnProperty(needle)) {
      delete views[needle];
      writeRaw(KEYS.views, views);
    }

    document.dispatchEvent(new CustomEvent('tapx:profiles-changed'));
    return true;
  }

    function isRemoved(username) {
    var removed = readRaw(KEYS.removed, []) || [];
    return removed.indexOf(String(username || '').toLowerCase()) !== -1;
  }

    function clearRemoved() {
    writeRaw(KEYS.removed, []);
  }

    function setProfileActive(username, active) {
    var profile = getProfile(username);
    if (!profile) return false;
    return saveProfile(Object.assign({}, profile, { active: !!active }),
      { ignoreUsername: profile.username }).ok;
  }

    function sanitizeProfile(input) {
    var FIELDS = [
      'username', 'fullName', 'title', 'bio', 'profileImage',
      'school', 'course', 'yearLevel', 'email', 'phone', 'location',
      'instagram', 'facebook', 'tiktok', 'messenger', 'linkedin',
      'website', 'portfolio', 'cardStatus'
    ];
    var STATUSES = ['draft', 'printed', 'issued'];
    var out = {};
    FIELDS.forEach(function (field) {
      var value = input && input[field] !== undefined ? input[field] : '';
      value = String(value);
      /* profileImage may be a base64 photo from the upload box - it is
         re-encoded by the dashboard (canvas JPEG) before it gets here,
         so it is capped generously instead of the 600-char text limit */
      var limit = field === 'profileImage' ? 400000 : 600;
      if (value.length > limit) value = value.slice(0, limit);
      out[field] = value.trim();
    });

    if (STATUSES.indexOf(out.cardStatus) === -1) out.cardStatus = 'draft';
    /* Cloud switch: a disabled card shows the "inactive" screen.
       Booleans only — the string fields above never receive it. */
    var active = input ? input.active : undefined;
    out.active = !(active === false || active === 'false' ||
      active === 0 || active === '0');
    /* Images: http(s), relative asset paths, or an inline base64 photo
       (data:image/...;base64, - never scriptable, browsers only decode
       it as an image). Anything else is dropped. */
    if (!/^https?:\/\//i.test(out.profileImage) &&
        !/^\.?\//.test(out.profileImage) &&
        !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(out.profileImage) &&
        out.profileImage) {
      out.profileImage = '';
    }
    return out;
  }

  function getViews(username) {
    var all = readRaw(KEYS.views, {});
    var key = String(username || '').toLowerCase();
    return all[key] || 0;
  }

  function recordView(username) {
    var all = readRaw(KEYS.views, {});
    var key = String(username || '').toLowerCase();
    all[key] = (all[key] || 0) + 1;
    writeRaw(KEYS.views, all);

    var profile = getProfile(username);
    if (profile) {
      profile.views = all[key];
      var list = getAllProfiles().map(function (p) {
        return p.username.toLowerCase() === key ? profile : p;
      });
      writeRaw(KEYS.profiles, list);
    }
    return all[key];
  }

  function getSettings() {
    return readRaw(KEYS.settings, {}) || {};
  }

  function saveSettings(patch) {
    var next = Object.assign({}, getSettings(), patch || {});
    writeRaw(KEYS.settings, next);
    return next;
  }

    function seedDemo() {
    var demoProfiles = [
      {

        username: 'zedrix',
        fullName: 'Zedrix Reyes',
        title: 'BSIT Student · TapX Demo',
        bio: 'Demo TapX profile. One tap on the NFC card opens this page.',
        profileImage: 'assets/default-avatar.png',
        school: 'Northfield Institute of Technology',
        course: 'Bachelor of Science in Information Technology',
        yearLevel: '3rd Year',
        email: 'zedrix@example.com',
        phone: '+63 900 111 2222',
        location: 'Manila, Philippines',
        instagram: 'zedrix',
        facebook: 'zedrix.reyes',
        tiktok: '@zedrix',
        messenger: 'zedrix.reyes',
        linkedin: 'zedrix-reyes',
        website: 'https://example.com/zedrix',
        cardStatus: 'issued'
      },
      {
        username: 'juan',
        fullName: 'Juan Delacruz',
        title: 'BSIT Student',
        bio: 'Student developer interested in programming and technology.',
        profileImage: 'assets/default-avatar.png',
        school: 'Northfield Institute of Technology',
        course: 'Bachelor of Science in Information Technology',
        yearLevel: '3rd Year',
        email: 'juan@example.com',
        phone: '+63 900 000 0000',
        location: 'Manila, Philippines',
        instagram: 'juan.delacruz',
        facebook: 'juan.delacruz',
        tiktok: '@juan.delacruz',
        messenger: 'juan.delacruz',
        linkedin: 'juan-delacruz',
        website: 'https://example.com',
        portfolio: 'https://example.com/portfolio',
        cardStatus: 'draft'
      },
      {
        username: 'maria_santos',
        fullName: 'Maria Santos',
        title: 'Content Creator',
        bio: 'Lifestyle creator sharing food, travel and daily vlogs.',
        profileImage: 'assets/default-avatar.png',
        school: 'San Ildefonso College',
        course: 'Communication Arts',
        yearLevel: 'Graduate',
        email: 'maria@example.com',
        phone: '+63 901 000 0000',
        location: 'Cebu, Philippines',
        instagram: 'maria.santos',
        facebook: 'maria.santos',
        tiktok: '@maria.santos',
        messenger: 'maria.santos',
        linkedin: 'maria-santos',
        website: 'https://example.com/maria',
        cardStatus: 'issued'
      },
      {
        username: 'karl_mercado',
        fullName: 'Karl Mercado',
        title: 'Freelance Photographer',
        bio: 'Event and portrait photographer available for bookings.',
        profileImage: 'assets/default-avatar.png',
        school: 'Baguio Creative Academy',
        course: 'Fine Arts',
        yearLevel: 'Graduate',
        email: 'karl@example.com',
        phone: '+63 902 000 0000',
        location: 'Baguio, Philippines',
        instagram: 'karl.shoots',
        facebook: 'karl.mercado',
        tiktok: '@karl.shoots',
        messenger: 'karl.mercado',
        linkedin: 'karl-mercado',
        website: 'https://example.com/karl',
        cardStatus: 'printed'
      }
    ];

    demoProfiles.forEach(function (profile) {

      if (isRemoved(profile.username)) return;
      if (!profileExists(profile.username)) {
        saveProfile(profile, { allowExisting: true });
      }
    });

    if (HAS_LS) window.localStorage.setItem(KEYS.seeded, '1');
    return getProfile('juan');
  }

  window.TapXStorage = {
    isPersistent: HAS_LS,
    validateProfile: validateProfile,
    normalizeSocials: normalizeSocials,
    saveProfile: saveProfile,
    getProfile: getProfile,
    getAllProfiles: getAllProfiles,
    deleteProfile: deleteProfile,
    isRemoved: isRemoved,
    clearRemoved: clearRemoved,
    profileExists: profileExists,
    setProfileActive: setProfileActive,
    recordView: recordView,
    getViews: getViews,
    getSettings: getSettings,
    saveSettings: saveSettings,
    seedDemo: seedDemo,
    USERNAME_RE: USERNAME_RE
  };
})();
