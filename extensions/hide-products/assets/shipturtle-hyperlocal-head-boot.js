/**
 * ShipTurtle Hyperlocal — optional early boot for theme <head>
 * ------------------------------------------------------------
 * Paste the IIFE (from `(function () {` through `})();`) into
 * layout/theme.liquid inside <head>, wrapped in <script>...</script>.
 *
 * Purpose:
 * - Collection/search: if visitor_zip is in localStorage but the Shipturtle
 *   filter param is missing from the URL, do one location.replace (optional
 *   brief cloak). Reduces unfiltered flash.
 * - Product: if visitor_zip is set and a filter param key can be resolved,
 *   set html.st-hyperlocal-product-pending + CSS so body stays hidden until
 *   the app embed knows whether that ZIP is in the product list (no ZIP in
 *   storage → no guard; same idea as collection/search). Optional 8s fallback
 *   removes the class if the embed never runs.
 *
 * hyperlocal.js runs the same URL sync again on DOMContentLoaded as a fallback;
 * the app embed does not duplicate it.
 *
 * Ongoing behavior (price facets, sort, etc.) is handled by hyperlocal.js
 * (enforceFilter, facet forms, section:load) — this file does not run again.
 *
 * Param key resolution — same order as hyperlocal.js getFilterParamKey():
 *   1) window.filterParamValue (if another head script set it)
 *   2) localStorage zip_param_key
 *   3) any filter.p.m.st_hyperlocal.* on the current URL (also saved to zip_param_key)
 *   4) localStorage hyperlocalMetaFieldKey (from app embed Liquid)
 *   5) SHIPTURTLE_META_KEY_SUFFIX if not the placeholder
 *
 * ZIP: localStorage visitor_zip (same as app embed / hyperlocal.js).
 */
(function () {
  'use strict';

  // ── Sharded model config — must match the Liquid embed and PHP config. ──
  // Backend writes coverage to N parallel `shipturtle.zips_0` … `zips_{N-1}`
  // metafields. This file's job is to compute the correct shard key from the
  // stored zip and pre-apply it to the URL before body renders.
  var SHARD_COUNT = 8;   // keep in sync with config('hyperlocal.shard_count') + Liquid
  var KEY_PREFIX  = 'zips_';

  // CRC-32 / IEEE-802.3 (polynomial 0xEDB88320) — byte-identical to PHP's crc32().
  var CRC_TABLE = (function () {
    var t = new Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c;
    }
    return t;
  })();

  function crc32(s) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < s.length; i++) {
      crc = CRC_TABLE[(crc ^ s.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function normalizeZip(z) {
    return String(z == null ? '' : z).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function computeShard(z) {
    var n = normalizeZip(z);
    return n ? (crc32(n) % SHARD_COUNT) : 0;
  }

  var LS_ZIP_KEY = 'visitor_zip';
  var LS_PARAM_KEY_STORAGE = 'zip_param_key';

  function isCollectionOrSearchPath() {
    var p = location.pathname || '';
    if (p.indexOf('/collections/') === 0) return true;
    if (p === '/search' || p.indexOf('/search/') === 0) return true;
    return false;
  }

  /** Shopify product URLs: /products/handle */
  function isProductPath() {
    var p = location.pathname || '';
    return p.indexOf('/products/') === 0;
  }

  function readZip() {
    try {
      return (localStorage.getItem(LS_ZIP_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function persistParamKey(key) {
    try {
      if (key && key.indexOf('filter.p.m.st_hyperlocal') === 0) {
        localStorage.setItem(LS_PARAM_KEY_STORAGE, key);
      }
    } catch (e) {}
  }

  /**
   * Mirrors hyperlocal.js getFilterParamKey(): the key is the buyer's stored
   * zip → its shard → `filter.p.m.st_hyperlocal.zips_<shard>`. Falls back to any
   * shipturtle filter already on the URL (e.g. deep-linked landings).
   */
  function resolveFilterParamKey() {
    var zip = readZip();
    if (zip) {
      return 'filter.p.m.st_hyperlocal.' + KEY_PREFIX + computeShard(zip);
    }

    try {
      var url = new URL(location.href);
      var found = null;
      url.searchParams.forEach(function (value, key) {
        if (found) return;
        if (key.indexOf('filter.p.m.st_hyperlocal') === 0) found = key;
      });
      if (found) {
        persistParamKey(found);
        return found;
      }
    } catch (e) {}

    return null;
  }

  /** Remove stray Shipturtle keys so only canonical paramKey + zip remain. */
  function canonicalizeShipturtleParams(params, paramKey) {
    var toRemove = [];
    params.forEach(function (value, key) {
      if (key.indexOf('filter.p.m.st_hyperlocal') === 0 && key !== paramKey) {
        toRemove.push(key);
      }
    });
    toRemove.forEach(function (key) {
      params.delete(key);
    });
  }

  function buildUrl(pathname, params, hash) {
    var qs = params.toString();
    return pathname + (qs ? '?' + qs : '') + (hash || '');
  }

  function runCollectionSearchSync() {
    if (!isCollectionOrSearchPath()) return;

    var paramKey = resolveFilterParamKey();
    if (!paramKey) return;

    var zip = readZip();
    if (!zip) return;

    var url;
    try {
      url = new URL(location.href);
    } catch (e) {
      return;
    }

    var params = url.searchParams;
    canonicalizeShipturtleParams(params, paramKey);

    if (params.get(paramKey) === zip) {
      persistParamKey(paramKey);
      return;
    }

    params.set(paramKey, zip);
    persistParamKey(paramKey);

    var cloak = document.createElement('style');
    cloak.setAttribute('data-st-hyperlocal-head-cloak', '');
    cloak.textContent =
      'html{overflow-x:hidden}body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(cloak);

    location.replace(buildUrl(url.pathname, params, url.hash));
  }

  /**
   * Hide body until hyperlocal.js runProductPageGate() clears
   * st-hyperlocal-product-pending.
   */
  function runProductPaintGuard() {
    if (!isProductPath()) return;

    var paramKey = resolveFilterParamKey();
    if (!paramKey) return;

    // No stored ZIP → same as collection/search (show content); no need to hide.
    if (!readZip()) return;

    var doc = document.documentElement;
    doc.classList.add('st-hyperlocal-product-pending');

    var guard = document.createElement('style');
    guard.setAttribute('data-st-hyperlocal-head-product-paint-guard', '');
    guard.textContent =
      'html.st-hyperlocal-product-pending body{visibility:hidden!important}' +
      'html.st-hyperlocal-product-pending{overflow-x:hidden}';
    (document.head || doc).appendChild(guard);

    setTimeout(function () {
      try {
        doc.classList.remove('st-hyperlocal-product-pending');
      } catch (e) {}
    }, 8000);
  }

  function run() {
    runCollectionSearchSync();
    runProductPaintGuard();
  }

  run();
})();
