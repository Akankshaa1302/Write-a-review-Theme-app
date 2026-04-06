const ZIP_STORAGE_KEY = 'visitor_zip';
const FILTER_PARAM_KEY_STORAGE = 'zip_param_key';
const SHIPTURTLE_FILTER_PREFIX = 'filter.p.m.shipturtle';
const PRODUCT_MSG_ATTR = 'data-st-hyperlocal-product-msg';
const KOSHER_HOST = 'koshermarket.eu';

const FILTER_LABELS = ['hyperlocal zipcodes'];

const MSG = {
  notInArea: 'This product is not available in your area.',
  currentZipUnset: 'Not set',
};

const ST_HYPERLOCAL_EMBED_CONFIG_ID = 'st-hyperlocal-embed-config';

let __stHyperlocalEmbedConfigApplied = false;

/**
 * Hydrates globals from `#st-hyperlocal-embed-config` (JSON) output by the app embed Liquid.
 * Block settings and product metafields must be server-rendered; Shopify cannot inject them into a static asset file.
 */
function initStHyperlocalEmbedFromJson() {
  if (__stHyperlocalEmbedConfigApplied) return true;

  const el = document.getElementById(ST_HYPERLOCAL_EMBED_CONFIG_ID);
  if (!el) return false;

  let cfg;
  try {
    cfg = JSON.parse(el.textContent);
  } catch {
    return false;
  }

  const key = String(cfg.hyperlocalMetaFieldKey || '').trim();
  if (key) {
    try {
      localStorage.setItem('hyperlocalMetaFieldKey', key);
    } catch {
      /* non-fatal */
    }
  }
  if (!window.hyperlocalMetaFieldKey) {
    window.hyperlocalMetaFieldKey = key;
  }
  if (key) {
    window.filterParamValue = `filter.p.m.shipturtle.${key}`;
  }

  window.__stHyperlocalUiSettings = {
    zipCodeBtn: cfg.zipCodeBtn,
    popupHeader: cfg.popupHeader,
    placeholderText: cfg.placeholderText,
    currentZipCode: cfg.currentZipCode,
    buttonBackgroundColor: cfg.buttonBackgroundColor,
    submitLabel: cfg.submitLabel || 'Submit',
    introCopyProduct: cfg.introCopyProduct,
    introCopyDefault: cfg.introCopyDefault,
    isProductTemplate: cfg.isProductTemplate,
    popupLogoUrl: cfg.popupLogoUrl,
  };

  if (cfg.isProductTemplate) {
    const raw = cfg.productZipCodes;
    let zipCodes = null;
    if (raw != null) {
      if (Array.isArray(raw)) {
        zipCodes = [...raw];
      } else if (typeof raw === 'string' && raw.trim()) {
        zipCodes = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      }
    }
    window.productMetafields = { zipCodes };
  }

  try {
    el.remove();
  } catch {
    /* non-fatal */
  }

  __stHyperlocalEmbedConfigApplied = true;
  return true;
}

(function bootstrapStHyperlocalEmbedConfig() {
  if (initStHyperlocalEmbedFromJson()) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStHyperlocalEmbedFromJson(), {
      once: true,
    });
  } else {
    initStHyperlocalEmbedFromJson();
  }
})();

// ---------------------------------------------------------------------------
// Filter param key (aligned with shipturtle-hyperlocal-head-boot.js)
// ---------------------------------------------------------------------------

function getFilterParamKey() {
  if (window.filterParamValue) return window.filterParamValue;

  const stored = localStorage.getItem(FILTER_PARAM_KEY_STORAGE);
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  for (const [key] of params) {
    if (key.startsWith(SHIPTURTLE_FILTER_PREFIX)) {
      localStorage.setItem(FILTER_PARAM_KEY_STORAGE, key);
      return key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ZIP storage (localStorage only)
// ---------------------------------------------------------------------------

const ZipStorage = {
  get() {
    try {
      return (localStorage.getItem(ZIP_STORAGE_KEY) || '').trim();
    } catch {
      return '';
    }
  },
  set(zip) {
    try {
      const z = (zip || '').trim();
      if (z) localStorage.setItem(ZIP_STORAGE_KEY, z);
    } catch {
      /* non-fatal */
    }
  },
  remove() {
    try {
      localStorage.removeItem(ZIP_STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
  },
};

// ---------------------------------------------------------------------------
// Collection / search: links + facet forms
// ---------------------------------------------------------------------------

function isCollectionOrSearchPathname(pathname) {
  const p = pathname || '';
  if (p.startsWith('/collections/')) return true;
  if (p === '/search' || p.startsWith('/search/')) return true;
  return false;
}

/** Drop stray filter.p.m.shipturtle.* so only canonical paramKey remains. */
function canonicalizeShipturtleParams(params, paramKey) {
  const toRemove = [];
  params.forEach((value, key) => {
    if (key.startsWith(SHIPTURTLE_FILTER_PREFIX) && key !== paramKey) {
      toRemove.push(key);
    }
  });
  toRemove.forEach((key) => params.delete(key));
}

function ensureZipHiddenOnForm(form, paramKey, zip) {
  let hiddenInput = [...form.querySelectorAll('input[type="hidden"]')].find(
    (el) => el.name === paramKey
  );
  if (!hiddenInput) {
    hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = paramKey;
    form.appendChild(hiddenInput);
  }
  hiddenInput.value = zip;
}

function patchClearLinks() {
  const zip = ZipStorage.get();
  const paramKey = getFilterParamKey();
  if (!zip || !paramKey) return;

  document.querySelectorAll('a[href]').forEach((link) => {
    let url;
    try {
      url = new URL(link.href, window.location.origin);
    } catch {
      return;
    }
    if (!isCollectionOrSearchPathname(url.pathname)) return;

    let changed = false;
    canonicalizeShipturtleParams(url.searchParams, paramKey);

    if (url.searchParams.get(paramKey) !== zip) {
      url.searchParams.set(paramKey, zip);
      changed = true;
    }

    if (changed) link.href = url.toString();
  });

  document.querySelectorAll('form[action]').forEach((form) => {
    const action = form.getAttribute('action');
    if (!action) return;

    try {
      const url = new URL(action, window.location.origin);
      if (!isCollectionOrSearchPathname(url.pathname)) return;

      ensureZipHiddenOnForm(form, paramKey, zip);
    } catch {
      // Ignore invalid URLs.
    }
  });
}

let __stEnforceZipScheduled = false;
function scheduleCollectionSearchZipMaintenance() {
  if (__stEnforceZipScheduled) return;
  __stEnforceZipScheduled = true;
  requestAnimationFrame(() => {
    __stEnforceZipScheduled = false;
    patchClearLinks();
    enforceCollectionSearchZipInUrl();
  });
}

/**
 * If the address bar is missing the canonical ZIP filter (or has a wrong value),
 * re-apply with location.replace. Needed when Search & Discovery / facets strip
 * filter params (e.g. Remove all) or after SPA-style section swaps.
 */
function enforceCollectionSearchZipInUrl() {
  if (!isCollectionOrSearchPage()) return;

  const zip = ZipStorage.get();
  const paramKey = getFilterParamKey();
  if (!zip || !paramKey) return;

  try {
    const url = new URL(window.location.href);
    canonicalizeShipturtleParams(url.searchParams, paramKey);

    if (url.searchParams.get(paramKey) === zip) return;

    applyVisibilityCloak();
    url.searchParams.set(paramKey, zip);
    window.location.replace(
      url.pathname + (url.search ? url.search : '') + (url.hash || '')
    );
  } catch {
    /* non-fatal */
  }
}

let __stHistoryHooked = false;
function hookHistoryForCollectionSearchZip() {
  if (__stHistoryHooked) return;
  __stHistoryHooked = true;

  function notify() {
    scheduleCollectionSearchZipMaintenance();
  }

  window.addEventListener('popstate', notify);

  ['pushState', 'replaceState'].forEach((method) => {
    const orig = history[method];
    history[method] = function (...args) {
      const ret = orig.apply(this, args);
      notify();
      return ret;
    };
  });
}

let __stFacetObserver = null;
let __stFacetObserverTimeout = 0;

/**
 * Prefer facet subtree; then `<main>` (filters/grid usually live there, less noise than `body`);
 * then `body` if the theme has no `<main>` or puts facets outside it (e.g. some drawer UIs).
 */
function getFacetMutationObserverRoot() {
  return (
    document.querySelector('.facets-container') ||
    document.querySelector('main') ||
    document.body
  );
}

function observeFacetsForCollectionSearchZip() {
  if (__stFacetObserver) {
    try {
      __stFacetObserver.disconnect();
    } catch {
      /* non-fatal */
    }
    __stFacetObserver = null;
  }

  const root = getFacetMutationObserverRoot();
  const debounced = () => {
    clearTimeout(__stFacetObserverTimeout);
    __stFacetObserverTimeout = window.setTimeout(
      () => scheduleCollectionSearchZipMaintenance(),
      120
    );
  };

  __stFacetObserver = new MutationObserver(debounced);
  __stFacetObserver.observe(root, { childList: true, subtree: true });
}

function setupCollectionSearchFilterPersistence() {
  const zip = ZipStorage.get();
  const paramKey = getFilterParamKey();
  if (!zip || !paramKey) return;

  hookHistoryForCollectionSearchZip();
  observeFacetsForCollectionSearchZip();

  document.addEventListener('shopify:section:load', () => {
    observeFacetsForCollectionSearchZip();
    scheduleCollectionSearchZipMaintenance();
  });

  scheduleCollectionSearchZipMaintenance();
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function getPageType() {
  return window.meta?.page?.pageType || '';
}

function isCollectionOrSearchPage() {
  const t = getPageType();
  return t === 'collection' || t === 'searchresults';
}

function applyVisibilityCloak() {
  const cloak = document.createElement('style');
  cloak.setAttribute('data-st-hyperlocal-cloak', '');
  cloak.textContent =
    'html{overflow-x:hidden}body{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(cloak);
}

/**
 * If stored ZIP is missing from the URL on collection/search, one replace.
 * Fallback when theme head-boot (shipturtle-hyperlocal-head-boot.js) is absent
 * or exited early; embed no longer duplicates this.
 */
function syncCollectionSearchUrlFromStoredZip() {
  if (!isCollectionOrSearchPage()) return;

  const paramKey = getFilterParamKey();
  if (!paramKey) return;

  const zip = ZipStorage.get();
  if (!zip) return;

  try {
    const url = new URL(window.location.href);
    canonicalizeShipturtleParams(url.searchParams, paramKey);

    if (url.searchParams.get(paramKey) === zip) return;

    applyVisibilityCloak();
    url.searchParams.set(paramKey, zip);
    window.location.replace(
      url.pathname + (url.search ? url.search : '') + (url.hash || '')
    );
  } catch {
    /* non-fatal */
  }
}

/** iOS Safari: navigating while the keyboard is closing can desync the visual viewport until pinch-zoom. */
function shouldDeferNavigationForViewportBug() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function blurActiveZipUi() {
  const zipInput = document.getElementById('zip-input');
  if (zipInput) {
    try {
      zipInput.blur();
    } catch {
      /* non-fatal */
    }
  }
  const ae = document.activeElement;
  if (ae && typeof ae.blur === 'function') {
    try {
      ae.blur();
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * Blur fields, then run navigation after the keyboard starts closing on iOS
 * (double rAF + short timeout); other platforms run immediately.
 */
function runAfterKeyboardTeardown(fn) {
  blurActiveZipUi();
  if (!shouldDeferNavigationForViewportBug()) {
    fn();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(fn, 100);
    });
  });
}

function navigateAfterZipSubmit(zip) {
  if (window.location.pathname === '/pages/availability') {
    window.location.href = '/';
    return;
  }

  if (isCollectionOrSearchPage()) {
    const paramKey = getFilterParamKey() || window.filterParamValue;
    if (!paramKey) {
      window.location.reload();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(paramKey, zip);
    window.location.replace(url.toString());
    return;
  }

  window.location.reload();
}

// ---------------------------------------------------------------------------
// ZIP popup (bind handlers once — showPopup may run multiple times)
// ---------------------------------------------------------------------------

const ST_HYPERLOCAL_Z_INDEX = '1000000000000';

/**
 * UI strings / flags from `initStHyperlocalEmbedFromJson()` (`window.__stHyperlocalUiSettings`).
 */
function getHyperlocalUiSettings() {
  const c = window.__stHyperlocalUiSettings || {};
  const isProductPage =
    c.isProductTemplate === true || c.isProductTemplate === 'true';
  const intro = isProductPage
    ? c.introCopyProduct || c.introCopyDefault
    : c.introCopyDefault || c.introCopyProduct;
  return {
    zipCodeBtn: c.zipCodeBtn || 'Change ZIP Code',
    popupHeader: c.popupHeader || 'Enter ZIP Code',
    placeholderText: c.placeholderText || 'Enter ZIP Code',
    currentZipCode: c.currentZipCode || 'Current ZIP Code',
    buttonBackgroundColor: c.buttonBackgroundColor || '#000',
    submitLabel: c.submitLabel || 'Submit',
    popupLogoUrl: c.popupLogoUrl || '',
    introCopy:
      intro ||
      'Some products are only available in certain ZIP Locations. Please add zip code to see available products in your area.',
  };
}

/** Builds floating ZIP button + modal (formerly in hyperlocal.liquid). */
function injectZipPopupUi() {
  if (document.getElementById('zip-popup')) return;

  const s = getHyperlocalUiSettings();

  const btnWrap = document.createElement('div');
  const changeBtn = document.createElement('button');
  changeBtn.id = 'zipcode-change-button';
  changeBtn.type = 'button';
  changeBtn.textContent = s.zipCodeBtn;
  changeBtn.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'padding:10px',
    `background:${s.buttonBackgroundColor}`,
    'color:white',
    'border:none',
    'border-radius:50px',
    'cursor:pointer',
    `z-index:${ST_HYPERLOCAL_Z_INDEX}`,
  ].join(';');
  btnWrap.appendChild(changeBtn);
  document.body.appendChild(btnWrap);

  const outer = document.createElement('div');
  const zipPopup = document.createElement('div');
  zipPopup.id = 'zip-popup';
  zipPopup.style.cssText = [
    'display:none',
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'background:white',
    'padding:30px 20px',
    'border-radius:8px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.2)',
    `z-index:${ST_HYPERLOCAL_Z_INDEX}`,
    'max-width:350px',
    'width:90%',
    'text-align:center',
  ].join(';');

  const closeBtn = document.createElement('button');
  closeBtn.id = 'close-popup';
  closeBtn.type = 'button';
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.style.cssText =
    'position:absolute;top:10px;right:10px;background:transparent;border:none;font-size:24px;cursor:pointer;color:#333;padding:0';

  const h4 = document.createElement('h4');
  h4.style.cssText =
    'font-size:16px;color:#555;text-align:center;margin-bottom:20px';
  h4.textContent = s.popupHeader;

  const introP = document.createElement('p');
  introP.style.fontSize = '12px';
  introP.textContent = s.introCopy;

  const badgeWrap = document.createElement('div');
  badgeWrap.style.cssText =
    'display:inline-block;padding:0 12px;background-color:#174733;color:white;border-radius:50px;font-size:12px;font-weight:bold;margin-bottom:20px;margin-top:20px';

  const flex = document.createElement('div');
  flex.style.cssText = 'display:flex;align-items:center;gap:5px';
  const p1 = document.createElement('p');
  p1.textContent = `${s.currentZipCode}:`;
  const p2 = document.createElement('p');
  p2.id = 'visitor-zip-code';
  flex.appendChild(p1);
  flex.appendChild(p2);
  badgeWrap.appendChild(flex);

  const zipInput = document.createElement('input');
  zipInput.type = 'text';
  zipInput.id = 'zip-input';
  zipInput.placeholder = s.placeholderText;
  zipInput.setAttribute('autocomplete', 'postal-code');
  zipInput.setAttribute('inputmode', 'text');
  zipInput.style.cssText =
    'margin-bottom:15px;width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:16px;line-height:1.25;box-sizing:border-box';

  const zipSubmit = document.createElement('button');
  zipSubmit.id = 'zip-submit';
  zipSubmit.type = 'submit';
  zipSubmit.className = 'button button--secondary';
  zipSubmit.textContent = s.submitLabel;
  zipSubmit.style.cssText = `background:${s.buttonBackgroundColor};color:white`;

  const zipForm = document.createElement('form');
  zipForm.id = 'st-hyperlocal-zip-form';
  zipForm.setAttribute('novalidate', '');
  zipForm.style.cssText = 'margin:0;padding:0;border:none';
  zipForm.appendChild(zipInput);
  zipForm.appendChild(zipSubmit);

  zipPopup.appendChild(closeBtn);

  if (s.popupLogoUrl) {
    const logo = document.createElement('img');
    logo.src = s.popupLogoUrl;
    logo.alt = 'Logo';
    logo.style.cssText = 'display:block;max-width:120px;max-height:60px;margin:0 auto 16px';
    zipPopup.appendChild(logo);
  }

  zipPopup.appendChild(h4);
  zipPopup.appendChild(introP);
  zipPopup.appendChild(badgeWrap);
  zipPopup.appendChild(zipForm);

  outer.appendChild(zipPopup);
  document.body.appendChild(outer);
}

function syncZipPopupCloseButton() {
  const zipPopup = document.getElementById('zip-popup');
  const closeBtn = zipPopup?.querySelector('#close-popup');
  if (!closeBtn) return;
  const canDismiss = !!ZipStorage.get();
  closeBtn.hidden = !canDismiss;
  closeBtn.setAttribute('aria-disabled', canDismiss ? 'false' : 'true');
}

function bindZipPopupOnce() {
  const zipPopup = document.getElementById('zip-popup');
  const zipForm = document.getElementById('st-hyperlocal-zip-form');
  const zipInput = document.getElementById('zip-input');
  const closeBtn = zipPopup?.querySelector('#close-popup');

  if (!zipPopup || !zipForm || zipForm.dataset.stHyperlocalBound) return;
  zipForm.dataset.stHyperlocalBound = '1';

  zipForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const zip = zipInput?.value?.trim() || '';
    if (!zip) return;

    ZipStorage.set(zip);
    runAfterKeyboardTeardown(() => navigateAfterZipSubmit(zip));
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (!ZipStorage.get()) return;
      zipPopup.style.display = 'none';
    });
  }

  syncZipPopupCloseButton();
}

function showPopup() {
  injectZipPopupUi();
  const zipPopup = document.getElementById('zip-popup');
  if (!zipPopup) return;

  bindZipPopupOnce();

  const visitorZipCode = document.getElementById('visitor-zip-code');
  if (visitorZipCode) {
    visitorZipCode.textContent = ZipStorage.get() || MSG.currentZipUnset;
  }
  syncZipPopupCloseButton();
  zipPopup.style.display = 'block';
}

function setupChangeButton() {
  const changeButton = document.getElementById('zipcode-change-button');
  if (!changeButton || changeButton.dataset.stHyperlocalBound) return;
  changeButton.dataset.stHyperlocalBound = '1';

  changeButton.addEventListener('click', () => {
    sessionStorage.removeItem('redirected');
    showPopup();
  });
}

function initZipCaptureUi() {
  injectZipPopupUi();
  patchClearLinks();
  bindZipPopupOnce();
  setupChangeButton();

  const currentPath = window.location.pathname;
  if (currentPath === '/pages/availability') return;

  if (!ZipStorage.get()) showPopup();

  const changePinCodeLink = document.getElementById('change-pin-code');
  if (changePinCodeLink && !changePinCodeLink.dataset.stHyperlocalBound) {
    changePinCodeLink.dataset.stHyperlocalBound = '1';
    changePinCodeLink.addEventListener('click', (event) => {
      event.preventDefault();
      showPopup();
    });
  }
}

// ---------------------------------------------------------------------------
// Product page gating (koshermarket.eu uses product-info + tabs chrome)
// ---------------------------------------------------------------------------

function createProductMessageEl(text) {
  const div = document.createElement('div');
  div.setAttribute(PRODUCT_MSG_ATTR, '');
  div.style.textAlign = 'center';
  div.style.margin = '3rem 0';
  div.textContent = text;
  return div;
}

function applyKosherProductUnavailableChrome(productInfo, customTabs) {
  const pageWidth = productInfo.querySelector('div.page-width');
  if (pageWidth) pageWidth.style.display = 'none';
  if (customTabs?.parentElement) {
    customTabs.parentElement.style.display = 'none';
  }
}

/** Theme head shipturtle-hyperlocal-head-boot.js may set this until gate runs. */
function clearStHyperlocalProductPaintGuard() {
  try {
    document.documentElement.classList.remove('st-hyperlocal-product-pending');
  } catch {
    /* non-fatal */
  }
}

/**
 * Product page: if visitor ZIP is set and excluded from product zip list, replace
 * the page with a message. Uses rAF retries so main / product-info exist (same
 * idea as the former hyperlocal.liquid gate).
 */
function runProductPageGate() {
  if (
    window.__stHyperlocalProductGateApplied ||
    window.__stHyperlocalProductGatePending
  ) {
    return;
  }

  if (getPageType() !== 'product') {
    clearStHyperlocalProductPaintGuard();
    return;
  }

  if (!getFilterParamKey()) {
    clearStHyperlocalProductPaintGuard();
    return;
  }

  const zip = ZipStorage.get();
  const zipCodes = window.productMetafields?.zipCodes;

  if (!zip) {
    clearStHyperlocalProductPaintGuard();
    return;
  }

  if (!zipCodes?.length) {
    clearStHyperlocalProductPaintGuard();
    return;
  }

  if (zipCodes.includes(zip)) {
    clearStHyperlocalProductPaintGuard();
    return;
  }

  window.__stHyperlocalProductGatePending = true;

  const message = MSG.notInArea;
  const isKosher = window.location.host === KOSHER_HOST;
  let attempts = 0;

  function removeCloak() {
    clearStHyperlocalProductPaintGuard();
    document.body.style.visibility = '';
  }

  function apply() {
    attempts += 1;
    if (attempts > 120) {
      removeCloak();
      window.__stHyperlocalProductGatePending = false;
      return;
    }

    const main = document.querySelector('main');
    const productInfo = isKosher ? document.querySelector('product-info') : null;
    const customTabs = isKosher
      ? document.querySelector('#km-tabs-container')
      : null;

    if (isKosher && productInfo) {
      if (document.querySelector(`[${PRODUCT_MSG_ATTR}]`)) {
        window.__stHyperlocalProductGateApplied = true;
        window.__stHyperlocalProductGatePending = false;
        removeCloak();
        return;
      }
      applyKosherProductUnavailableChrome(productInfo, customTabs);
      productInfo.appendChild(createProductMessageEl(message));
      window.__stHyperlocalProductGateApplied = true;
      window.__stHyperlocalProductGatePending = false;
      removeCloak();
      return;
    }

    if (isKosher && !productInfo && attempts < 50) {
      requestAnimationFrame(apply);
      return;
    }

    if (!main) {
      requestAnimationFrame(apply);
      return;
    }

    if (!document.querySelector(`[${PRODUCT_MSG_ATTR}]`)) {
      main.innerHTML = '';
      main.appendChild(createProductMessageEl(message));
    }
    window.__stHyperlocalProductGateApplied = true;
    window.__stHyperlocalProductGatePending = false;
    removeCloak();
  }

  requestAnimationFrame(apply);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initStHyperlocalEmbedFromJson();
  runProductPageGate();
  initZipCaptureUi();
  syncCollectionSearchUrlFromStoredZip();
  setupCollectionSearchFilterPersistence();
});



// Remove Filter UI
// if (window.location.host !== 'koshermarket.eu') {
//   // ==================== PARAM KEY ====================

//   // ==================== URL ====================
//   function buildUrl({ zip, sortBy } = {}) {
//     const url = new URL(window.location.href);
//     const paramKey = getFilterParamKey();

//     if (paramKey) {
//       url.searchParams.delete(paramKey);
//       if (zip) url.searchParams.set(paramKey, zip);
//     }

//     if (sortBy) {
//       url.searchParams.set('sort_by', sortBy);
//     }

//     return url.toString();
//   }

//   // ==================== ENFORCEMENT ====================
//   function enforceFilter() {
//     if (!isCollectionOrSearchPage() || getPageType() !== 'product') return

//     const zip = Storage.get();
//     const paramKey = getFilterParamKey();

//     if (!zip || !paramKey) return;

//     const url = new URL(window.location.href);
//     const current = url.searchParams.get(paramKey);

//     if (current !== zip) {
//       url.searchParams.set(paramKey, zip);
//       window.location.replace(url.toString());
//     }
//   }

//   // ==================== SORT INTERCEPT ====================
//   function interceptSorting() {
//     document.addEventListener('change', (e) => {
//       const select = e.target.closest('select[name="sort_by"]');
//       if (!select) return;

//       const zip = Storage.get();
//       const paramKey = getFilterParamKey();

//       if (!zip || !paramKey) return;

//       e.preventDefault();

//       const url = new URL(window.location.href);
//       url.searchParams.set('sort_by', select.value);
//       url.searchParams.set(paramKey, zip);

//       window.location.href = url.toString();
//     });
//   }

//   // ==================== UI PROTECTION ====================
//   function hideHyperlocalUI() {
//     // Hide facet groups
//     document.querySelectorAll('details.js-filter, .mobile-facets__details').forEach(group => {
//       const text = group.textContent.toLowerCase();
//       if (FILTER_LABELS.some(t => text.includes(t))) {
//         if (group.style.display !== 'none') {
//           group.style.display = 'none';
//         }
//       }
//     });

//     // Hide chips
//     document.querySelectorAll('.active-facets__button, .active-facets__button-wrapper').forEach(el => {
//       const text = el.textContent.toLowerCase();
//       if (FILTER_LABELS.some(t => text.includes(t))) {
//         if (el.style.display !== 'none') {
//           el.style.display = 'none';
//         }
//       }
//     });
//   }

//   function manageRemoveAllVisibility() {
//     const visible = [...document.querySelectorAll('.active-facets__button')]
//       .filter(el => el.offsetParent !== null).length;

//     document.querySelectorAll('.active-facets__button-remove, .mobile-facets__clear')
//       .forEach(el => {
//         el.style.display = visible === 0 ? 'none' : '';
//       });
//   }

//   // ==================== OBSERVER ====================
//   function setupObserver() {
//     let timeout;

//     const debounced = () => {
//       clearTimeout(timeout);
//       timeout = setTimeout(() => {
//         hideHyperlocalUI();
//         patchClearLinks();
//         manageRemoveAllVisibility();
//       }, 120);
//     };

//     const target = document.querySelector('.facets-container') || document.body;

//     const observer = new MutationObserver(debounced);

//     observer.observe(target, {
//       childList: true,
//       subtree: true
//       // ❌ NO attributes
//     });
//   }

//   const setupChangeButton = () => {
//     const changeButton = document.getElementById('zipcode-change-button')
//     changeButton.addEventListener('click', () => {
//         sessionStorage.removeItem('redirected');
//         console.log('Clicked')
//         showPopup();
//     });
// };


//   // ==================== POPUP ====================
//   function showPopup() {
//     const popup = document.getElementById('zip-popup');
//     if (!popup) return;

//     const visitorZipCode = document.getElementById('visitor-zip-code')
//     visitorZipCode.textContent = Storage.get()
//     popup.style.display = 'block';
//     const input = document.getElementById('zip-input');
//     const submit = document.getElementById('zip-submit');

//     submit.onclick = () => {
//       const zip = input.value.trim();
//       if (!zip) return;

//       Storage.set(zip);

//       if (meta.page.pageType === 'collection' || meta.page.pageType === 'searchresults') {
//         window.location.replace(buildUrl({ zip }));
//       } else {
//         window.location.reload();
//       }
//     };
//   }

//   // ==================== PRODUCT PAGE ====================
//   function handleProductPage() {
//     if (meta.page.pageType !== 'product') return;
//     if (
//       window.__stHyperlocalProductGateApplied ||
//       window.__stHyperlocalProductGatePending
//     ) {
//       return;
//     }

//     const zip = Storage.get();
//     const main = document.querySelector('main');
//     if (!main) return;

//     if (document.querySelector('[data-st-hyperlocal-product-msg]')) return;

//     if (!zip) {
//       main.innerHTML = `<div data-st-hyperlocal-product-msg style="text-align:center;margin:3rem 0">Please enter your ZIP code.</div>`;
//       return;
//     }

//     if (!window.productMetafields?.zipCodes?.includes(zip)) {
//       main.innerHTML = `<div data-st-hyperlocal-product-msg style="text-align:center;margin:3rem 0">Not available in your area.</div>`;
//     }
//   }

//   function getPageType() {
//     return window.meta?.page?.pageType || "";
//   }

//   function isCollectionOrSearchPage() {
//     const pageType = getPageType();
//     return pageType === "collection" || pageType === "searchresults";
//   }

//   // ==================== INIT ====================
//   function init() {
//     setupChangeButton()
//     enforceFilter(); // FIRST

//     if (!Storage.get()) {
//       showPopup();
//     }

//     interceptSorting();
//     setupObserver();

//     // initial run
//     hideHyperlocalUI();
//     patchClearLinks();
//     manageRemoveAllVisibility();

//     handleProductPage();

//     // back/forward navigation
//     window.addEventListener('popstate', enforceFilter);

//     document.addEventListener('shopify:section:load', () => {
//       hideHyperlocalUI();
//       patchClearLinks();
//     });
//   }

//   document.addEventListener('DOMContentLoaded', init);
// }