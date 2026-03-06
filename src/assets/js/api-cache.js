/* API Cache — localStorage-backed cache with TTL
   
   A lightweight cache shared across all posts that hit
   external APIs (OpenF1, HIBP, etc.). Persists across
   page loads until TTL expires or cache is explicitly cleared.

   Usage:
     ApiCache.get("my_key")             → data or null
     ApiCache.set("my_key", data, ttl)  → void  (ttl in ms)
     ApiCache.clear("my_key")           → void  (omit key to clear ALL)

   Notes:
     - Falls back to a no-op if localStorage isn't available
       (private browsing modes that block storage).
     - Data is JSON-serialised, so all stored values must be
       plain serialisable objects/arrays.
*/
(function () {
  "use strict";

  var PREFIX = "apicache_";

  /* Storage availability check */
  function storageAvailable() {
    try {
      var k = "__apicache_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var HAS_STORAGE = storageAvailable();

  /* Public API */
  window.ApiCache = {
    /**
     * Retrieve cached data for `key`.
     * Returns the stored data if present and not expired, otherwise null.
     */
    get: function (key) {
      if (!HAS_STORAGE) return null;
      try {
        var raw = localStorage.getItem(PREFIX + key);
        if (!raw) return null;
        var entry = JSON.parse(raw);
        if (!entry || !entry.ts || !entry.ttl) return null;
        if (Date.now() - entry.ts > entry.ttl) {
          localStorage.removeItem(PREFIX + key);
          return null;
        }
        return entry.data;
      } catch (e) {
        return null;
      }
    },

    /**
     * Store `data` under `key` with a TTL in milliseconds.
     * @param {string} key
     * @param {*}      data   — must be JSON-serialisable
     * @param {number} ttlMs  — e.g. 7 * 24 * 60 * 60 * 1000 for 7 days
     */
    set: function (key, data, ttlMs) {
      if (!HAS_STORAGE) return;
      try {
        var entry = { ts: Date.now(), ttl: ttlMs, data: data };
        localStorage.setItem(PREFIX + key, JSON.stringify(entry));
      } catch (e) {
        // Quota exceeded or serialisation error — fail silently
        console.warn("[ApiCache] Could not write key '" + key + "':", e.message || e);
      }
    },

    /**
     * Clear a single key, or — if called with no argument — clear every
     * entry written by this module (keys prefixed with `apicache_`).
     */
    clear: function (key) {
      if (!HAS_STORAGE) return;
      if (key !== undefined) {
        localStorage.removeItem(PREFIX + key);
        return;
      }
      // Clear all entries with our prefix
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) { localStorage.removeItem(k); });
    },

    /**
     * Returns the age of a cache entry in milliseconds, or -1 if absent.
     * Useful for debugging ("how stale is this?").
     */
    age: function (key) {
      if (!HAS_STORAGE) return -1;
      try {
        var raw = localStorage.getItem(PREFIX + key);
        if (!raw) return -1;
        var entry = JSON.parse(raw);
        return entry && entry.ts ? Date.now() - entry.ts : -1;
      } catch (e) {
        return -1;
      }
    }
  };

  /* ?flush URL param — clears all cache entries and reloads without param */
  if (HAS_STORAGE && window.location.search.indexOf("flush") !== -1) {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
    }
    toRemove.forEach(function (k) { localStorage.removeItem(k); });
    console.info("[ApiCache] Cache flushed (" + toRemove.length + " entries). Reloading\u2026");
    var cleanUrl = window.location.href
      .replace(/[?&]flush(?:=[^&]*)?/, "")
      .replace(/^([^?#]*)[?&]$/, "$1");
    window.location.replace(cleanUrl);
  }
})();
