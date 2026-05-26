# Hyperlocal — Theme Integration Notes

> Practical companion to [`hyperlocal-proposed-solution.md`](./hyperlocal-proposed-solution.md). That doc explains *why* the sharded model exists; this one lists exactly **what changes in the merchant's theme** to support it. Reference implementation for the JS lives in [`facets.reference.js`](./facets.reference.js).

These files live in the **Shopify theme**, not in the app extension:

- `assets/facets.js` — Search & Discovery's filter/sort renderer (Dawn-derived).
- `snippets/facets.liquid` — renders the filter UI (sidebar + active pills + mobile drawer).

---

## 1. The model in one paragraph

The buyer types one zipcode into the app-embed popup. It's stored in **`localStorage.visitor_zip`** (the single source of truth). The serviceable-zipcode coverage for each product is sharded across **N** product metafields `shipturtle.zips_0 … zips_{N-1}` by `crc32(normalize(zip)) % N`. At runtime the theme computes that same shard and applies **one** Search & Discovery filter:

```
filter.p.m.shipturtle.zips_<shard>=<normalized-zip>
```

Nothing derived is stored — the shard/key is recomputed from `visitor_zip` + `N` (N comes from the app-embed config `#st-hyperlocal-embed-config`, never hard-coded). See proposal §4 and §6 (invariants).

---

## 2. `assets/facets.js`

S&D rebuilds the URL params on every facet interaction (sort, price, checkbox, pill removal, back/forward) and **drops** the hyperlocal filter because it isn't a form input. The job here is to re-apply the single shard filter on every re-render so serviceability stays sticky.

**Full finalized file:** [`facets.reference.js`](./facets.reference.js) — copy it into `assets/facets.js`.

Summary of changes vs. the legacy file:

1. **Added** a shard helper block (`stCrc32`, `stNormalizeZip`, `stShardCount`, `stReadZip`, `stZipFilterParam`, `stApplyZipFilter`) — byte-identical crc32/normalize to `hyperlocal.js`.
2. Wrapped the three `renderPage` entry points:
   - `setListeners().onHistoryChange` → `renderPage(stApplyZipFilter(searchParams), null, false)`
   - `onSubmitForm` → `renderPage(stApplyZipFilter(searchParams), event)`
   - `onActiveFilterClick` → `renderPage(stApplyZipFilter(url))`
3. **Removed** the legacy bits: the `visitor_zones` cookie + JSON-array OR logic, the hard-coded key (`sp_…`), and the dead cookie read / commented block in `updateURLHash`.
4. `stReadZip()` reads **`localStorage.visitor_zip`** first, falls back to a `visitor_zip` cookie (migration safety).

`stApplyZipFilter()` strips any existing `filter.p.m.shipturtle.*` from the params before appending the current shard — so changing zip never leaves a stale shard, and there's never more than one shipturtle param (no OR-explosion).

---

## 3. `snippets/facets.liquid`

This snippet must **hide the shard filters from the visible UI** — buyers drive hyperlocal through the zip popup, never by clicking a filter. The legacy file hides a single filter by exact label:

```liquid
{% if filter.label != 'Hyperlocal Zipcodes' %} … {% endif %}
```

In the sharded model there are **N** filters (`zips_0 … zips_{N-1}`), each a separate S&D filter with its own label, so the single exact-label match no longer covers them.

### Change: hide by metafield key, not label

Match `filter.param_name` (the actual key, e.g. `filter.p.m.shipturtle.zips_0`) — catches all N shards and survives a label rename:

```liquid
{% unless filter.param_name contains 'shipturtle.zips_' %}
  …
{% endunless %}
```

Change **both** tags: `{% if … %}` → `{% unless … %}` **and** the matching `{% endif %}` → `{% endunless %}` (mind the `{%- endif %}` trim variant → `{%- endunless %}`).

### Locations to update

| # | Section | Legacy tag |
|---|---|---|
| 1 | Desktop facet list — `{% when 'boolean', 'list' %}` | `filter.label != "Hyperlocal Zipcodes"` (double quotes) |
| 2 | Horizontal active pills | `filter.label != 'Hyperlocal Zipcodes'` |
| 3 | Mobile facet list — `{% when 'boolean', 'list' %}` | `filter.label != 'Hyperlocal Zipcodes'` |
| 4 | Active-facets mobile pills | `filter.label != 'Hyperlocal Zipcodes'` |
| 5 | **Vertical active pills (`active-facets-desktop`)** | **missing the guard — add it** |

> #5 is a pre-existing gap: the vertical layout's active-pill loop has no hyperlocal check, so a `Hyperlocal Zipcodes: 400055` pill would show. Wrap its `<facet-remove>` in the same `{% unless filter.param_name contains 'shipturtle.zips_' %}` guard. Also scan for any other `Hyperlocal Zipcodes` occurrences and convert them all.

### Simpler alternative (no `param_name`)

Label every shard definition in S&D with a common token (e.g. all contain `Hyperlocal`) and use:

```liquid
{% unless filter.label contains 'Hyperlocal' %}
```

Simpler, but depends on consistent labeling in S&D admin — `param_name` is preferred because it can't be edited away.

Nothing else in `facets.liquid` changes — filtering is driven by the URL param from `facets.js` / `hyperlocal.js`; "clear all" and pill removal re-apply the zip filter via `onActiveFilterClick`.

---

## 4. Prerequisites outside the theme

These are not theme files but the theme integration depends on them:

1. **Normalize the filter *value* everywhere it's written.** `facets.js` sends the **normalized** zip. The app extension's `hyperlocal.js` (4 write-sites: `patchClearLinks`, `enforceCollectionSearchZipInUrl`, `syncCollectionSearchUrlFromStoredZip`, `navigateAfterZipSubmit`) and `shipturtle-hyperlocal-head-boot.js` (the `params.set(paramKey, zip)` line) currently write the **raw** zip. Until aligned, spaced/letter postcodes (`SW1A 1AA`) mismatch between popup navigation and facet re-render. The PHP sync must also **store** normalized values. (Proposal §6.3, Invariant C.)
2. **The app embed loads a minified JS file.** `blocks/hyperlocal.liquid` points at `hyperlocal-min.js`; verify the shipped minified file contains the sharded code (computes shard, publishes `window.__stShardCount`, writes `visitor_zip`) and isn't the stale legacy build.
3. **All N shard keys must be registered as filterable in Search & Discovery** (proposal open decision #4). If S&D only knows the old single key, the shard URLs filter nothing regardless of theme changes.
4. **CI fixture (Invariant A).** `facets.js` is now a 4th copy of the shard math alongside `hyperlocal.js`, `shipturtle-hyperlocal-head-boot.js`, and the PHP `HyperlocalShardService`. All four must be pinned to one committed fixture asserting byte-identical `crc32(normalize(zip)) % N`. (Proposal §6.1.)

---

## 5. Verification checklist

- [ ] Enter a zip in the popup → URL gains exactly one `filter.p.m.shipturtle.zips_<shard>=<zip>`, no `sp_…` key, no duplicates.
- [ ] Change sort / price / a checkbox → the `zips_<shard>` param survives the re-render (grid stays scoped).
- [ ] Click "Clear all" / remove a pill → the `zips_<shard>` param is re-applied (serviceability stays on).
- [ ] Change the zip to one in a different shard → the old `zips_*` param is replaced, not duplicated.
- [ ] No "Hyperlocal Zip…" filter group appears in the sidebar (desktop vertical, horizontal, mobile drawer).
- [ ] No "Hyperlocal Zipcodes: …" active pill appears (desktop vertical/horizontal, mobile).
- [ ] A UK/spaced postcode (`SW1A 1AA`) returns the same results from popup navigation and from a subsequent facet interaction (confirms value normalization is aligned).
- [ ] The shard JS computes the same index as PHP for a known zip (confirms Invariant A / the fixture).
