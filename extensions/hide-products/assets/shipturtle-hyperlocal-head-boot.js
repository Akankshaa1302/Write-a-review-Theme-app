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
 *   3) any filter.p.m.shipturtle.* on the current URL (also saved to zip_param_key)
 *   4) localStorage hyperlocalMetaFieldKey (from app embed Liquid)
 *   5) SHIPTURTLE_META_KEY_SUFFIX if not the placeholder
 *
 * ZIP: localStorage visitor_zip (same as app embed / hyperlocal.js).
 */
(function () {
  'use strict';

  /**
   * Optional. Same as "Hyperlocal Meta Field Key" in the app embed (e.g. sp_xxxx).
   * Leave REPLACE_WITH_YOUR_SP_KEY if (1)-(4) are enough on your store.
   */
  var SHIPTURTLE_META_KEY_SUFFIX = 'REPLACE_WITH_YOUR_SP_KEY';

  var LS_ZIP_KEY = 'visitor_zip';
  var LS_PARAM_KEY_STORAGE = 'zip_param_key';
  var LS_HYPERLOCAL_META_KEY = 'hyperlocalMetaFieldKey';

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
      if (key && key.indexOf('filter.p.m.shipturtle') === 0) {
        localStorage.setItem(LS_PARAM_KEY_STORAGE, key);
      }
    } catch (e) {}
  }

  /**
   * Mirrors hyperlocal.js getFilterParamKey() so pasted head code stays in sync.
   */
  function resolveFilterParamKey() {
    try {
      if (typeof window !== 'undefined' && window.filterParamValue) {
        return window.filterParamValue;
      }
    } catch (e) {}

    try {
      var stored = localStorage.getItem(LS_PARAM_KEY_STORAGE);
      if (stored) return stored;
    } catch (e) {}

    try {
      var url = new URL(location.href);
      var found = null;
      url.searchParams.forEach(function (value, key) {
        if (found) return;
        if (key.indexOf('filter.p.m.shipturtle') === 0) found = key;
      });
      if (found) {
        persistParamKey(found);
        return found;
      }
    } catch (e) {}

    try {
      var metaKey = (localStorage.getItem(LS_HYPERLOCAL_META_KEY) || '').trim();
      if (metaKey) return 'filter.p.m.shipturtle.' + metaKey;
    } catch (e) {}

    if (
      SHIPTURTLE_META_KEY_SUFFIX &&
      SHIPTURTLE_META_KEY_SUFFIX !== 'REPLACE_WITH_YOUR_SP_KEY'
    ) {
      return 'filter.p.m.shipturtle.' + SHIPTURTLE_META_KEY_SUFFIX;
    }

    return null;
  }

  /** Remove stray Shipturtle keys so only canonical paramKey + zip remain. */
  function canonicalizeShipturtleParams(params, paramKey) {
    var toRemove = [];
    params.forEach(function (value, key) {
      if (key.indexOf('filter.p.m.shipturtle') === 0 && key !== paramKey) {
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
