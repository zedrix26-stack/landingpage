/**
 * TapX — cloud.js
 * ------------------------------------------------------------------
 * Public Supabase (PostgREST) access for the profile page.
 *
 * Only the anon key lives here — it is safe to ship: read access is
 * public, every write is gated by the x-tapx-key header whose value
 * lives in cloud-key.js (dashboard only, never published).
 *
 * Network rules:
 *  - never fetches from file:// (double-clicked prototype stays offline)
 *  - never fetches from localhost test servers (tests stay hermetic)
 *  - 8s timeout, resolves { ok, row } — never rejects
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var C = {
    url: 'https://exinjftiirunoscwxlmc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4aW5qZnRpaXJ1bm9zY3d4bG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjMyMzQsImV4cCI6MjEwNjkzOTIzNH0.-GvgN2iFZZlfNKbx_rZ8SzCueQveqTCwwoxRFdAYUAs',
    writeKey: '',           /* filled by cloud-key.js on the dashboard */
    timeout: 8000
  };

  function isConfigured() {
    return !!(C.url && C.anonKey);
  }

  /** True when a real browser can talk to the database safely. */
  function isReady() {
    if (!isConfigured()) return false;
    if (typeof window.fetch !== 'function') return false;
    if (window.location.protocol === 'file:') return false;
    if (window.__TAPX_FORCE_CLOUD) return true;   /* test harness flag */
    var host = window.location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' ||
                host === '::1' || host === '[::1]';
    return !local;
  }

  /**
   * Dashboard writes are allowed even from a double-clicked file:// page
   * (or localhost): Supabase accepts the "null" origin — verified live:
   * preflight returns ACAO * and the POST echoes Origin: null.
   * Only the dashboard loads cloud-key.js, so only it ever gets a writeKey.
   */
  function canSync() {
    if (!isConfigured()) return false;
    if (typeof window.fetch !== 'function') return false;
    return !!C.writeKey;
  }

  function headers(extra) {
    var h = {
      'apikey': C.anonKey,
      'Authorization': 'Bearer ' + C.anonKey,
      'Content-Type': 'application/json'
    };
    if (C.writeKey) h['x-tapx-key'] = C.writeKey;
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }

  function request(path, init, timeout) {
    return new Promise(function (resolve) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout || C.timeout);
      var opts = Object.assign({}, init || {});
      if (ctrl) opts.signal = ctrl.signal;
      fetch(C.url + path, opts).then(function (res) {
        clearTimeout(timer);
        return res;
      }, function () {
        clearTimeout(timer);
        return null;                  /* offline / aborted / CORS — no throw */
      }).then(function (res) {
        if (!res) { resolve({ ok: false, status: 0 }); return; }
        res.json().then(function (body) {
          resolve({ ok: res.ok, status: res.status, body: body });
        }, function () {
          resolve({ ok: res.ok, status: res.status, body: null });
        });
      });
    });
  }

  /**
   * Usernames keep their original case in the database (the primary key is
   * case-sensitive text), but the app treats them case-insensitively. Build
   * a LIKE pattern that matches the value ignoring case, escaping the LIKE
   * wildcards (% _) so a username like "a_b" only matches the literal "a_b".
   */
  function likePattern(value) {
    return String(value).replace(/([\\%_])/g, '\\$1');
  }

  /**
   * Fetch one profile row.
   * Resolves { ok: true, row: object|null } when the database answered,
   * { ok: false } when it could not be reached.
   */
  function fetchProfile(username) {
    if (!isReady() || !username) {
      return Promise.resolve({ ok: true, row: null, local: true });
    }
    var path = '/rest/v1/profiles?username=ilike.' +
      encodeURIComponent(likePattern(String(username).trim())) +
      '&select=*&limit=1';
    return request(path, { method: 'GET', headers: headers() }).then(function (r) {
      if (!r.ok) return { ok: false, row: null };
      var rows = Array.isArray(r.body) ? r.body : [];
      return { ok: true, row: rows[0] || null };
    });
  }

  /**
   * Upsert every local card (used by the dashboard "Sync" button).
   * Resolves { ok, inserted, error }.
   */
  function syncProfiles(rows) {
    if (!canSync()) return Promise.resolve({ ok: false, error: 'not-ready' });
    if (!C.writeKey) return Promise.resolve({ ok: false, error: 'no-key' });
    if (!Array.isArray(rows) || !rows.length) {
      return Promise.resolve({ ok: true, inserted: 0 });
    }
    return request(
      '/rest/v1/profiles?on_conflict=username',
      {
        method: 'POST',
        headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows)
      },
      15000
    ).then(function (r) {
      if (!r.ok) {
        return { ok: false, error: r.status ? 'http-' + r.status : 'network' };
      }
      return { ok: true, inserted: rows.length };
    });
  }

  /**
   * Permanently delete one card from the database, targeted by its
   * unique id (the username primary key). Resolves { ok, deleted, error }.
   *  - ok:true  = the row no longer exists (deleted now, or already gone)
   *  - ok:false = the database could not be reached or refused the write,
   *               so the caller MUST keep the card on the website.
   */
  function deleteProfile(username) {
    var name = String(username || '').trim();
    if (!name) return Promise.resolve({ ok: false, error: 'no-username' });
    if (!canSync()) return Promise.resolve({ ok: false, error: 'not-ready' });

    var path = '/rest/v1/profiles?username=ilike.' + encodeURIComponent(likePattern(name));
    return request(path, {
      method: 'DELETE',
      headers: headers({ 'Prefer': 'return=representation' })
    }).then(function (r) {
      if (!r.ok) {
        return { ok: false, error: r.status ? 'http-' + r.status : 'network', status: r.status };
      }
      var deleted = Array.isArray(r.body) ? r.body.length : 0;
      return { ok: true, deleted: deleted };
    });
  }

  window.TapXCloud = {
    url: C.url,
    anonKey: C.anonKey,
    isConfigured: isConfigured,
    isReady: isReady,
    canSync: canSync,
    fetchProfile: fetchProfile,
    syncProfiles: syncProfiles,
    deleteProfile: deleteProfile,
    get writeKey() { return C.writeKey; },
    set writeKey(v) { C.writeKey = v; }
  };
})();
