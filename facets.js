// ── Hyperlocal sharded filter ──
const ST_FILTER_PREFIX   = 'filter.p.m.st_hyperlocal';
const ST_KEY_PREFIX      = 'zips_';
const ST_SHARD_FALLBACK  = 8;
const ST_ZIP_STORAGE_KEY = 'visitor_zip';

const ST_CRC_TABLE = (() => {
  const t = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function stCrc32(str) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc = ST_CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function stNormalizeZip(zip) {
  return String(zip == null ? '' : zip).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function stShardCount() {
  const n = Number(window.__stShardCount);
  if (Number.isFinite(n) && n > 0) return n;
  try {
    const el = document.getElementById('st-hyperlocal-embed-config');
    if (el) {
      const c = Number(JSON.parse(el.textContent).shardCount);
      if (Number.isFinite(c) && c > 0) return c;
    }
  } catch { /* ignore */ }
  return ST_SHARD_FALLBACK;
}

function stReadZip() {
  try {
    const ls = (localStorage.getItem(ST_ZIP_STORAGE_KEY) || '').trim();
    if (ls) return ls;
  } catch { /* ignore */ }
  const m = document.cookie.split('; ').find((r) => r.startsWith(ST_ZIP_STORAGE_KEY + '='));
  return m ? decodeURIComponent(m.split('=')[1] || '').trim() : '';
}

function stZipFilterParam() {
  const norm = stNormalizeZip(stReadZip());
  if (!norm) return '';
  const shard = stCrc32(norm) % stShardCount();
  return `${ST_FILTER_PREFIX}.${ST_KEY_PREFIX}${shard}=${encodeURIComponent(norm)}`;
}

function stApplyZipFilter(searchParams) {
  const params = new URLSearchParams(searchParams || '');
  [...params.keys()].forEach((k) => { if (k.startsWith(ST_FILTER_PREFIX)) params.delete(k); });
  let out = params.toString();
  const zp = stZipFilterParam();
  if (zp) out = out ? `${out}&${zp}` : zp;
  return out;
}

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    this.querySelector("a").addEventListener("click", (event) => {
      event.preventDefault();
      const form =
        this.querySelector("facet-sidebar") ||
        document.querySelector("facet-sidebar");
      form.onActiveFilterClick(event);
    });
  }
}
customElements.define("facet-remove", FacetRemove);

class FacetSidebarForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);
    this.debouncedOnSubmit = debounce((event) => {
      event.preventDefault();
      this.onSubmitHandler(event);
    }, 500);

    if (window.innerWidth < 768) {
      if (this.querySelector("form").getAttribute("id") == "FacetSortForm") {
        this.querySelector("form").addEventListener(
          "input",
          this.debouncedOnSubmit.bind(this),
        );
      }
    } else {
      this.querySelector("form").addEventListener(
        "input",
        this.debouncedOnSubmit.bind(this),
      );
    }
    this.querySelector("form").addEventListener(
      "submit",
      this.onSubmitHandler.bind(this),
    );
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state
        ? event.state.searchParams
        : FacetSidebarForm.searchParamsInitial;
      if (searchParams === FacetSidebarForm.searchParamsPrev) return;
      FacetSidebarForm.renderPage(stApplyZipFilter(searchParams), null, false);
    };
    window.addEventListener("popstate", onHistoryChange);
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetSidebarForm.searchParamsPrev = searchParams;
    const sections = FacetSidebarForm.getSections();
    document
      .getElementById("products-container")
      .querySelector(".product-card-grid")
      .classList.add("loading");
    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const facetDataUrl = (element) => element.url === url;
      FacetSidebarForm.filterData.some(facetDataUrl)
        ? FacetSidebarForm.renderSectionFromCache(facetDataUrl, event)
        : FacetSidebarForm.renderSectionFromFetch(url, event);
    });
    if (updateURLHash) FacetSidebarForm.updateURLHash(searchParams);
    document.dispatchEvent(new CustomEvent("collection:reloaded"));
  }

  static renderSectionFromFetch(url, event) {
    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetSidebarForm.filterData = [
          ...FacetSidebarForm.filterData,
          { html, url },
        ];
        FacetSidebarForm.renderFilters(html, event);
        FacetSidebarForm.renderProductGridContainer(html);
        FacetSidebarForm.renderProductCount(html);
      })
      .catch((e) => {
        console.error(e);
      });
  }

  static renderSectionFromCache(facetDataUrl, event) {
    const html = FacetSidebarForm.filterData.find(facetDataUrl).html;
    FacetSidebarForm.renderFilters(html, event);
    FacetSidebarForm.renderProductGridContainer(html);
    FacetSidebarForm.renderProductCount(html);
  }

  static renderProductGridContainer(html) {
    document.getElementById("products-container").innerHTML = new DOMParser()
      .parseFromString(html, "text/html")
      .getElementById("products-container").innerHTML;
  }

  static renderProductCount(html) {
    const count = new DOMParser()
      .parseFromString(html, "text/html")
      .getElementById("facet-product-count").innerHTML;
    const container = document.getElementById("facet-product-count");
    if (container) {
      container.innerHTML = count;
    }
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, "text/html");
    const facetDetailsElements = parsedHTML.querySelectorAll(
      "#SidebarfacetForm .js-filter",
    );
    const matchesIndex = (element) => {
      const jsFilter = event ? event.target.closest(".js-filter") : undefined;
      return jsFilter
        ? element.dataset.index === jsFilter.dataset.index
        : false;
    };
    const facetsToRender = Array.from(facetDetailsElements).filter(
      (element) => !matchesIndex(element),
    );
    const countsToRender = Array.from(facetDetailsElements).find(matchesIndex);
    facetsToRender.forEach((element) => {
      document.querySelector(
        `.js-filter[data-index="${element.dataset.index}"]`,
      ).innerHTML = element.innerHTML;
    });

    FacetSidebarForm.renderActiveFacets(parsedHTML);
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = [".active-facet"];
    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML =
        activeFacetsElement.innerHTML;
    });
  }

  static updateURLHash(searchParams) {
    history.pushState(
      {},
      "",
      `${window.location.pathname}${searchParams && "?".concat(searchParams)}`,
    );
  }

  static getSections() {
    return [
      {
        section: document.getElementById("product-card-grid").dataset.id,
      },
    ];
  }

  createSearchParams(form) {
    const formData = new FormData(form);
    return new URLSearchParams(formData);
  }

  mergeSearchParams(form, searchParams) {
    const params = this.createSearchParams(form);
    params.forEach((value, key) => {
      searchParams.append(key, value);
    });
    return searchParams;
  }

  onSubmitForm(searchParams, event) {
    FacetSidebarForm.renderPage(stApplyZipFilter(searchParams), event);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const currentForm = event.target.closest("form");
    let searchParams = new URLSearchParams();
    const sortFilterForms = document.querySelectorAll("facet-sidebar form");
    sortFilterForms.forEach((form) => {
      if (form.id === "SidebarfacetForm" || form.id === "FacetSortForm") {
        searchParams = this.mergeSearchParams(form, searchParams);
      }
    });

    this.onSubmitForm(searchParams.toString(), event);
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetSidebarForm.renderPage(
      stApplyZipFilter(new URL(event.currentTarget.href).searchParams.toString()),
    );
  }
}
FacetSidebarForm.filterData = [];
FacetSidebarForm.searchParamsInitial = window.location.search.slice(1);
FacetSidebarForm.searchParamsPrev = window.location.search.slice(1);
customElements.define("facet-sidebar", FacetSidebarForm);
FacetSidebarForm.setListeners();

class PriceSlider extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    let rangeslider = this.querySelector(".range-slider"),
      amounts = this.querySelector(".facets-price-ranges"),
      args = {
        start: [
          parseFloat(rangeslider.dataset.minValue),
          parseFloat(rangeslider.dataset.maxValue),
        ],
        connect: true,
        step: 1,
        range: {
          min: parseFloat(rangeslider.dataset.min),
          max: parseFloat(rangeslider.dataset.max),
        },
      },
      event = new CustomEvent("input"),
      form =
        this.closest("facet-sidebar") ||
        document.querySelector("facet-sidebar");
    if (rangeslider.classList.contains("noUi-target")) {
      rangeslider.noUiSlider.destroy();
    }
    noUiSlider.create(rangeslider, args);

    rangeslider.noUiSlider.on("update", function (values) {
      amounts.querySelector(".field__input_min").value = values[0];
      amounts.querySelector(".field__input_max").value = values[1];
    });
    rangeslider.noUiSlider.on("change", function (values) {
      form.querySelector("form").dispatchEvent(event);
    });
  }
}
customElements.define("price-range", PriceSlider);

class ShowMoreFilterButton extends HTMLElement {
  constructor() {
    super();
    const attributes = {
      expanded: "aria-expanded",
    };
    this.querySelector(".show-more-button").addEventListener(
      "click",
      (event) => {
        const filter = this.closest(".facets-accordion");
        (filter.setAttribute(
          attributes.expanded,
          (filter.getAttribute(attributes.expanded) === "false").toString(),
        ),
          filter.querySelector(".more-items").classList.toggle("hidden"));
        this.querySelectorAll(".visible-hidden").forEach((element) =>
          element.classList.toggle("hidden"),
        );
      },
    );
  }
}
customElements.define("show-more-button", ShowMoreFilterButton);
class FacetsDrawer extends HTMLElement {
  constructor() {
    super();
    this.querySelector("[data-drawer-head]").addEventListener(
      "click",
      this.openDrawer.bind(this),
    );
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }
  openDrawer(event) {
    event.preventDefault();
    const drawer = document.querySelector("#facets-filte-drawer");
    drawer.style.transition = "transform 0.3s ease";
    drawer.style.transform = "translateY(0)";
    setTimeout(
      function () {
        drawer.classList.add("open");
        setTimeout(
          function () {
            focusElement = this.querySelector("[data-drawer-head]");
            trapFocusElements(drawer);
          }.bind(this),
          500,
        );
      }.bind(this),
      500,
    );
    this.closeDrawer();
  }
  closeDrawer() {
    const drawer = document.querySelector("#facets-filte-drawer");
    if (drawer) {
      const closeElements = drawer.querySelectorAll("[data-close-drawer]");
      Array.from(closeElements).forEach(function (closeElement) {
        closeElement.addEventListener("click", function (event) {
          event.preventDefault();
          drawer.classList.remove("open");
          if (focusElement) {
            focusElement.focus();
          }
          focusElement = "";
          removeTrapFocus();
        });
      });
    }
  }
  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.closeDrawer(event); // Call closeDrawer when Escape is pressed
    }
  }
}
customElements.define("facets-drawer", FacetsDrawer);

class SwipeDrawer {
  constructor(drawerElement) {
    this.drawer = drawerElement;
    this.startY = 0;
    this.currentY = 0;
    this.isDragging = false;
    this.threshold = 100; // Minimum distance to swipe for closing
    this.drawerCard = this.drawer.querySelector(".drawer-inner-card");

    // Bind events
    this.drawer.addEventListener("touchstart", this.onTouchStart.bind(this), {
      passive: true,
    });
    this.drawer.addEventListener("touchmove", this.onTouchMove.bind(this), {
      passive: false,
    });
    this.drawer.addEventListener("touchend", this.onTouchEnd.bind(this), {
      passive: true,
    });
  }

  onTouchStart(event) {
    // Ensure the touch starts on the drawer itself
    if (event.target !== this.drawer && !this.drawer.contains(event.target)) {
      return; // Ignore touch events on inner elements
    }

    // Reset drag state to prevent accidental triggers
    this.isDragging = false;
    this.startY = event.touches[0].clientY;
    this.currentY = this.startY; // Reset currentY to ensure proper distance calculation
    this.drawer.classList.remove("dragging");
  }

  onTouchMove(event) {
    if (this.startY === null || !this.isDraggingAllowed(event)) return;

    this.isDragging = true; // Mark as dragging only if movement starts
    this.currentY = event.touches[0].clientY;

    const translateY = Math.max(0, this.currentY - this.startY);

    if (translateY > 0) {
      this.drawerCard.style.transform = `translateY(${translateY}px)`;
      event.preventDefault();

      this.drawer.classList.add("dragging");
    }
  }

  onTouchEnd() {
    if (!this.isDragging) return;

    const swipeDistance = this.currentY - this.startY;

    if (swipeDistance > this.threshold) {
      this.closeDrawer();
    } else {
      this.resetDrawerPosition();
    }

    this.drawer.classList.remove("dragging");
    // Reset dragging state
    this.isDragging = false;
    this.startY = null;
    this.currentY = null;
  }

  closeDrawer() {
    this.drawerCard.style.transform = `translateY(100%)`;

    setTimeout(() => {
      this.drawer.classList.remove("open");
    }, 300);
    setTimeout(() => {
      this.drawerCard.style.removeProperty("transform");
    }, 500);
  }

  resetDrawerPosition() {
    this.drawerCard.style.removeProperty("transform");
  }

  isDraggingAllowed(event) {
    const scrollableElement = event.target.closest(".drawer-content-contain");
    if (scrollableElement) {
      const { scrollTop, scrollHeight, clientHeight } = scrollableElement;
      const atTop = scrollTop === 0;
      const atBottom = scrollTop + clientHeight === scrollHeight;

      if (atTop && this.currentY > this.startY) return true; // Downward swipe
      if (atBottom && this.currentY < this.startY) return true; // Upward swipe

      return false;
    }

    return true;
  }
}

// Ensure the drawer is only closed by swiping
document.addEventListener("DOMContentLoaded", () => {
  const drawerElement = document.querySelector("facets-filter-drawer");
  if (drawerElement) {
    // Initialize SwipeDrawer
    new SwipeDrawer(drawerElement);
  }
});