(function () {
  'use strict';

  var C = {
    url: 'https://exinjftiirunoscwxlmc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4aW5qZnRpaXJ1bm9zY3d4bG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjMyMzQsImV4cCI6MjEwNjkzOTIzNH0.-GvgN2iFZZlfNKbx_rZ8SzCueQveqTCwwoxRFdAYUAs',
    writeKey: '',         
    timeout: 8000
  };

  function isConfigured() {
    return !!(C.url && C.anonKey);
  }

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
        return null;                
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

  function fetchProfile(username) {
    if (!isReady() || !username) {
      return Promise.resolve({ ok: true, row: null, local: true });
    }
    var path = '/rest/v1/profiles?username=eq.' +
      encodeURIComponent(String(username).toLowerCase()) +
      '&select=*&limit=1';
    return request(path, { method: 'GET', headers: headers() }).then(function (r) {
      if (!r.ok) return { ok: false, row: null };
      var rows = Array.isArray(r.body) ? r.body : [];
      return { ok: true, row: rows[0] || null };
    });
  }


  function syncProfiles(rows) {
    if (!isReady()) return Promise.resolve({ ok: false, error: 'not-ready' });
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

  window.TapXCloud = {
    url: C.url,
    anonKey: C.anonKey,
    isConfigured: isConfigured,
    isReady: isReady,
    fetchProfile: fetchProfile,
    syncProfiles: syncProfiles,
    get writeKey() { return C.writeKey; },
    set writeKey(v) { C.writeKey = v; }
  };
})();
