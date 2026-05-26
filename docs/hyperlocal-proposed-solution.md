# Hyperlocal Delivery — Proposed Solution

> Companion to [`hyperlocal-problem-statement.md`](./hyperlocal-problem-statement.md). Read that first for the problem framing. This doc proposes a concrete, scalable architecture and walks the flows end-to-end.

---

## 1. Executive Summary

**The constraint.** Shopify caps `list.single_line_text_field` metafields at **128 entries** and S&D filter URL OR-cardinality has practical limits. We cannot push thousands of zipcodes onto a single metafield, and we cannot OR-match thousands of warehouses or vendors in a URL.

**The solution.** Keep the **filter unit = zipcode** (so buyer-side cardinality stays at one value) but **shard each product's serviceable-zipcode list across N flat metafields** using a deterministic hash. Each shard holds ≤128 entries. Buyer JS computes the shard for the entered zipcode in O(1) and applies the matching S&D filter URL.

**Why this scales.** N is a tuning dial under the platform's 200-definitions-per-resource limit. N=32 gives ~3,500 zipcodes per product (UK nationwide). N=128 gives ~15,500. There is no buyer-side OR-cardinality explosion regardless of how many vendors serve a given pincode.

**What we abandoned and why.**

- `warehouse_id` or `vendor_id` as the filter unit: dies in restaurant/marketplace scenarios where 1,000+ vendors share a single pincode → URL OR-cardinality blows past Shopify's filter cap.
- Single `json` metafield holding nested arrays: S&D cannot filter inside opaque JSON; the data is unreachable from URL filters.
- Server-side product-ID resolver replacing S&D: kills SEO, breaks native pagination, adds latency on every collection page.

---

## 2. Design Goals & Non-Goals

### Goals

1. Remove the 128-zipcode hard cap as a felt limitation for merchants.
2. Eliminate silent truncation — sync either succeeds completely or fails loudly.
3. Enforce per-product coverage isolation (Problem 4 in the problem statement).
4. Keep collection/search rendering on Shopify's native S&D path (SEO + pagination + speed).
5. Keep the buyer-side JS dependency-free — no new SDKs, no API calls in the hot path.

### Non-Goals

- Cross-shop coverage. Each Shopify shop is independent.
- Geocoding addresses to lat/lng. Buyer still types a pincode; we never read GPS.
- Real-time inventory. This system answers "is this product serviceable to this pincode" — not "is it in stock right now".
- Replacing Shopify's product catalog. We stay on Shopify's storefront.

---

## 3. Industry Context — How Blinkit / Instamart / Zomato Handle This

Worth understanding because **we deliberately diverge** from their approach.

### Blinkit / Swiggy Instamart / Zepto

- **Architecture model:** custom backend, microservices, Redis-backed real-time inventory per **dark store**.
- **Serviceability check:** the user's GPS lat/lng is sent to a serviceability API which returns `storesInfo[]` — which dark store(s) cover this point and their status.
- **Catalog:** dark-store-scoped. A product is bound to a specific dark store's inventory; the storefront shows only what that store has.
- **Sources:**
  - [Inside Swiggy Instamart's mega dark store plan (Inc42)](https://inc42.com/features/swiggy-instamart-mega-dark-store-plan-ipo/) — serviceability API takes lat/lng, returns dark-store match.
  - [Blinkit: technical deep dive (dev.to)](https://dev.to/elisaray/blinkit-a-technical-deep-dive-into-the-future-of-hyperlocal-delivery-25h4) — dark-store-level Redis inventory, geocoding for address→coords.

### Zomato / Swiggy (restaurants)

- **Architecture model:** geohash-based spatial index in Redis sorted sets.
- **Serviceability:** restaurants are indexed by their geohash. User lat/lng → geohash → prefix-match against the index → list of restaurants whose geohash shares prefix → distance filter on remaining candidates.
- **Why geohash works for them:** nearby points share geohash prefixes, so prefix matching naturally produces "things near me".
- **Sources:**
  - [Efficient location-based fetch using geohash + Redis (Medium)](https://medium.com/@sarvesh10n/efficient-technique-to-fetch-data-based-on-location-7d1caa261867) — Redis `geoadd` / `geosearch`, geohash prefix discard.
  - [Geospatial index: how Zomato/Yelp find nearby (Medium)](https://medium.com/@jagriti.bansal/how-google-search-yelp-zomato-find-nearby-businesses-geospatial-index-06c78f4f935b) — geohash grid recursion.

### Why we don't copy them

| Their world | Our world |
|---|---|
| They own the storefront. They control rendering, pagination, filters end-to-end. | We render on **Shopify's storefront**. S&D defines the filter contract. |
| They run a serviceability API on the hot path of every page load. | A blocking API call on every Shopify collection load destroys LCP and breaks SEO crawling. |
| They have lat/lng from device GPS. | We have a **buyer-typed pincode**, often before any location permission prompt. |
| They build custom Redis-backed geospatial indices. | We must encode coverage into Shopify metafields that S&D can filter. |

Their architecture is irrelevant to our binding constraint, which is **Shopify's filter contract**, not spatial-index cleverness. Geohash would make sense if we owned the storefront. We don't. So we design *around* Shopify, not in parallel to it.

That said, the architectural **principle** is shared: **precompute the index, query in O(1) at runtime**. Our sharded metafields are exactly that — just expressed in the only data structure S&D can filter.

---

## 4. Proposed Architecture

### 4.1 Core Idea

For each product, store its serviceable zipcodes split deterministically across **N parallel metafield lists**:

```
shipturtle.zips_0   ← zips where hash(zip) mod N == 0   (max 128)
shipturtle.zips_1   ← zips where hash(zip) mod N == 1   (max 128)
...
shipturtle.zips_31  ← zips where hash(zip) mod N == 31  (max 128)
```

At buyer-side, the JS computes the same `hash(buyer_zip) mod N` to know which shard key to filter against. The URL becomes:

```
?filter.p.m.shipturtle.zips_<shard>=<buyer_zip>
```

S&D filters products whose `zips_<shard>` list contains the buyer's zip. **Match is exact**, **single-value**, **no OR-explosion**.

### 4.2 Parameters

| Parameter | Value | Notes |
|---|---|---|
| `N` (shard count) | **Adaptive per shop** — smallest N that fits the merchant's largest warehouse coverage | Not a global default. See §4.6 (slot budget). Recomputed on each warehouse save; only grows, never shrinks within a sync window. |
| `hash` | `crc32(zip)` | Same in PHP (`crc32()`) and JS (vetted polyfill). Deterministic, no crypto, fast. See §6 for the invariants this depends on. |
| Metafield namespace | `shipturtle` | Existing namespace, no breakage. |
| Metafield type | `list.single_line_text_field` | Already what S&D needs. |
| Definitions per shop | N (varies, typically 2–32, occasionally 64–128) | Created lazily on first need. See §4.6 for slot-pressure handling. |
| Per-product instances | 0..N | Only shards with content are written. |

**N sizing reference:**

| Merchant profile | Per-product coverage | Required N | Definition slots |
|---|---|---|---|
| Restaurant / dark store | ≤200 zips | 2 | 2 |
| City grocery | ≤500 zips | 4 | 4 |
| Multi-city grocery | ≤1,500 zips | 16 | 16 |
| UK nationwide (outcodes) | ≤3,500 zips | 32 | 32 |
| State-wide India | ≤7,500 zips | 64 | 64 |
| India nationwide | ≤15,500 zips | 128 | 128 |

### 4.3 Why crc32 and not Murmur / SHA / geohash

- **Determinism cross-language**: PHP and JS must compute the identical shard for the same zipcode. `crc32` is one line in both.
- **Uniform distribution**: we want flat distribution across shards (max-load minimization). `crc32` is uniformly distributed on numeric strings, which zipcodes mostly are.
- **Not geohash**: geohash *clusters* nearby zipcodes together, which is the opposite of what we want. A merchant in Mumbai with 200 zips all geohash-clustered would dump everything into 1–2 shards, blowing the 128 cap. Random uniform hash spreads them.
- **Not cryptographic**: no security requirement here, crypto hashes are unnecessary overhead.

### 4.4 Per-Product Coverage (not company-wide)

Today's sync writes the **union of all warehouse zipcodes** to **every product in the company**. The proposed sync writes, for each product, only `union(zipcodes of warehouses that actually fulfill this product)`. This:

- Fixes Problem 4 (cross-vendor leak) by construction.
- Reduces per-product metafield size to actual coverage, not company-wide noise.
- Requires a **product → warehouses** association, which today doesn't exist as a first-class relation (see Section 8 — open decisions).

### 4.5 Per-Vendor Namespace (deferred)

The problem statement (Problem 4) mentions vendor namespacing. Under per-product coverage (4.4), vendor isolation is enforced *implicitly* — each product carries only the coverage of warehouses that fulfill it, which are the vendor's warehouses. We don't need a separate vendor namespace in the metafield key to enforce isolation; the data structure does it.

Keeping the namespace flat (`shipturtle.zips_<i>`) avoids per-vendor definition explosion: in a 500-vendor marketplace, per-vendor namespacing would require 500 × N definitions, breaking Shopify's 200-per-resource cap. Flat namespace is mandatory.

### 4.6 Metafield Slot Budget — Hard Upper Limit

Shopify imposes a **200-metafield-definitions-per-resource-type** ceiling (per shop). This is a *shared* budget across:

- Every app the merchant has installed (Reviews, Subscriptions, Loyalty, etc., each typically register 3–20 definitions)
- Every native Shopify category/taxonomy metafield enabled
- Merchant-authored custom attributes
- Shipturtle's own existing metafields (commission, vendor link, etc.)

Real-world headroom on a mature shop is often **far less than 200** — sometimes <50. Allocating 32 slots unconditionally to hyperlocal is irresponsible.

**Design rules:**

1. **Adaptive N, not global default.** N is set per shop to the smallest power-of-two that fits the largest required per-product coverage. Most shops will end up at N=2 or N=4. Only nationwide retailers should land at N=32+.

2. **Pre-flight slot probe at module enable.**
   - Query `metafieldDefinitions(ownerType: PRODUCT)` count via admin GraphQL.
   - Compute required N from largest warehouse coverage.
   - If `(200 - existing_count) < N`: **fail the enable flow with a clear merchant-facing message** listing how many slots are needed vs. available, and link to Shopify's metafield admin for cleanup. No silent partial enable.

3. **Lazy growth, not eager pre-allocation.**
   - On module enable: create only enough definitions for the *current* largest coverage.
   - On a warehouse save that exceeds current N's capacity: re-probe slots, expand N, dispatch a `RebuildHyperlocalShardsJob` to resync all products under the new N.
   - On a warehouse save that fits current N: no definition change, business as usual.

4. **Reuse the legacy definition.** Existing merchants already have one `shipturtle.<random_slug>` (legacy) definition. The migration plan (open decision #2) repurposes that slug as `zips_0` instead of burning a fresh slot, saving one definition for legacy merchants.

5. **Hard fail, never silently shrink.** If slot pressure later prevents the required N (e.g., merchant installs another heavy app post-enable), we surface an explicit error and refuse the sync. Silent fallback to a smaller N would re-introduce truncation — the very bug we're solving.

**Worked example.** A multi-vendor marketplace shop has: 80 existing definitions (other apps + native), wants to enable hyperlocal for a 5 km-radius restaurant marketplace (max coverage ~250 zips → N=4 sufficient). 80 + 4 = 84/200. ✅ Enables. Two years later, a new vendor adds a 50 km warehouse (max coverage now ~2,000 zips → N=32 required). Probe runs: 80 + 32 = 112/200. ✅ Expands. A year after that, merchant adds three more apps pushing existing count to 175. New warehouse pushes required N=64. Probe: 175 + 64 = 239 > 200. ❌ Hard fail with merchant-facing message.

---

## 5. End-to-End Flows

### 5.1 Component Diagram

```
┌──────────────────────────── SHIPTURTLE BACKEND ─────────────────────────────┐
│                                                                              │
│  WarehouseController ──► HyperlocalZipcode (Haversine, 2.4M rows)           │
│       │                                                                       │
│       │ resolves radius → zipcode list                                        │
│       ▼                                                                       │
│  warehouses.zip_codes (JSON)   ◄── source of truth                            │
│       │                                                                       │
│       │ dispatch (per affected product, not per warehouse)                    │
│       ▼                                                                       │
│  SyncZipCodesWithProductsJob (rewritten)                                      │
│       │                                                                       │
│       │  for each product in affected_products:                               │
│       │     coverage = ⋃ zips of warehouses fulfilling this product           │
│       │     buckets[N] = group_by(coverage, λz: crc32(z) % N)                 │
│       │     productUpdate(product_id, metafields: [                           │
│       │       {key: zips_0,  value: buckets[0]},                              │
│       │       {key: zips_1,  value: buckets[1]},                              │
│       │       ...                                                              │
│       │       {key: zips_N-1, value: buckets[N-1]},                           │
│       │     ])                                                                 │
│       ▼                                                                       │
│  Shopify GraphQL Admin API                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

                            ▲
                            │ writes
                            │
┌──────────────────────────── SHOPIFY ────────────────────────────────────────┐
│                                                                              │
│  Product metafields (per product):                                            │
│    shipturtle.zips_0  : [<≤128 zips>]                                         │
│    shipturtle.zips_1  : [<≤128 zips>]                                         │
│    ...                                                                         │
│    shipturtle.zips_31 : [<≤128 zips>]                                         │
│                                                                              │
│  Search & Discovery: each zips_<i> registered as a filterable field          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

                            ▲
                            │ queries via filter URL
                            │
┌──────────────────────────── BUYER (THEME) ──────────────────────────────────┐
│                                                                              │
│  hyperlocal.js                                                                │
│    1. read shard_count N from embed config                                    │
│    2. read buyer_zip from popup input → localStorage                          │
│    3. shard = crc32(buyer_zip) % N                                            │
│    4. construct URL:                                                          │
│         /collections/all?filter.p.m.shipturtle.zips_{shard}={buyer_zip}      │
│    5. on product page: read shipturtle.zips_{shard} via embed JSON,           │
│       check membership, gate page if absent                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Merchant Save Sequence

```
Merchant     WarehouseController   SyncJob               Shopify Admin GraphQL
   │                │                  │                          │
   │ save warehouse │                  │                          │
   │───────────────▶│                  │                          │
   │                │ Haversine query  │                          │
   │                │ → zip list       │                          │
   │                │                  │                          │
   │                │ persist          │                          │
   │                │ warehouses.zip_codes                         │
   │                │                  │                          │
   │                │ dispatch ───────▶│                          │
   │                │                  │ for each product:        │
   │                │                  │   compute shards         │
   │                │                  │   productUpdate ────────▶│
   │                │                  │                   <── ok │
   │                │                  │ log shop_sync_log entry  │
```

### 5.3 Buyer Browse Sequence

```
Buyer            hyperlocal.js          Shopify (S&D)
  │                    │                      │
  │ open storefront    │                      │
  │───────────────────▶│                      │
  │                    │ inject popup         │
  │ type zip = 400055  │                      │
  │───────────────────▶│                      │
  │                    │ shard = crc32 % 32   │
  │                    │       = 7            │
  │                    │ build URL with       │
  │                    │ ?filter...zips_7=400055
  │                    │ window.location ────▶│
  │                    │                      │ S&D match:
  │                    │                      │   products WHERE
  │                    │                      │   zips_7 ∋ "400055"
  │                    │                ◀──── collection HTML
  │ servable grid      │                      │
  │◀───────────────────│                      │
```

### 5.4 Product Page Gate Sequence

Already partially implemented in `hyperlocal.js`. Adapted for sharded metafields:

```
Buyer            hyperlocal.js               Liquid embed
  │                    │                          │
  │ open /products/x   │                          │
  │───────────────────▶│                          │
  │                    │  read #st-hyperlocal-embed-config JSON
  │                    │◀─────────────────────────│ contains
  │                    │                          │   productMetafields.zipCodes
  │                    │                          │   (the shard for this product)
  │                    │                          │
  │                    │ shard = crc32(buyer_zip) % 32
  │                    │ if buyer_zip ∉ productMetafields.zipCodes_<shard>:
  │                    │    swap page with "not available in your area"
  │                    │ else:
  │                    │    render normally
```

The Liquid embed must server-render **only the shard matching the buyer's zip**, not all N shards. The shard is computed at render time from the buyer's stored zip (passed in via cookie / `localStorage` synced query param). Avoids dumping all N×128 zips into page HTML.

---

## 6. Correctness Invariants & Gotchas

Shard determinism is **mathematically guaranteed** — `crc32(zip) mod N` is a pure function — but only if four implementation invariants hold. Violate any one and you get silently-wrong shards: zero matches when there should be some, and no error to chase.

### 6.1 Invariant A — Hash determinism PHP ↔ JS

- PHP `crc32()` returns an unsigned 32-bit integer using polynomial `0xEDB88320`.
- JavaScript has no built-in `crc32`. We ship a polyfill.
- Polyfills from the wild can return *signed* (negative) values, or use a different polynomial. Either produces a different shard than PHP.

**Required:** one frozen, vetted polyfill checked into the theme bundle, with a **CI test fixture** of ~500 sample zipcodes (Indian PIN, UK postcode, US ZIP, German PLZ, edge cases like "00000", "99999", postcodes with letters) asserting **byte-identical** `crc32(zip) mod N` between PHP and JS for every entry. Test fixture lives in both backend test suite and theme extension test suite.

### 6.2 Invariant B — N must not drift

If the backend resyncs at N=32 but the JS embed config still says N=16, JS computes shard against N=16 and queries `zips_<7>` while the data was written to `zips_<23>`. Result: zero matches for every buyer.

**Required:**
- N transported in the embed config (`#st-hyperlocal-embed-config`) on every page render. **Never** hard-coded in JS.
- N changes are atomic: the backend writes the new N's metafields, then flips the embed config, in that order. Mid-state is guarded by a feature flag or staged release.
- The `RebuildHyperlocalShardsJob` that grows N must complete before the embed config flips. The job is the gate.

### 6.3 Invariant C — Zipcode normalization is identical on both sides

Buyer-typed zips have ambiguity:

| Format | Buyer types | Could be stored as |
|---|---|---|
| US ZIP | `10001` | `10001`, `10001-1234` |
| UK postcode | `SW1A 1AA` | `SW1A 1AA`, `SW1A1AA`, `sw1a 1aa` |
| Indian PIN | `400 055` | `400055`, `400 055` |
| Whitespace | ` 400055` | `400055` |

Hash(`400055`) ≠ Hash(`400 055`) ≠ Hash(` 400055 `). Any mismatch = wrong shard = zero results.

**Required:** one normalization function (recommend: `uppercase + strip all non-alphanumeric`), implemented identically in PHP and JS, applied **on both sides** before hashing **and** before storing the metafield value. Same CI fixture verifies. Country-specific quirks (e.g., should US ZIP+4 be stripped to 5 digits?) are explicit decisions, not implicit behavior.

### 6.4 Invariant D — Shard correctness ≠ coverage correctness

If the buyer's zip simply isn't served by any product, all of A/B/C are correct and the buyer still sees an empty grid. This is **not a shard bug** but it'll be reported as one ("hyperlocal broken").

**Required:** structured logging of buyer-side submissions:
- Buyer zip (after normalization)
- Computed shard index + N at the moment of submission
- Match count (collection page) / `inList` boolean (product page)

Lets support distinguish "shard mismatch" (zero matches *despite* shards being computed consistently) from "genuine unserviceable" (zero matches because no warehouse covers it).

### 6.5 Multi-vendor same-zip trace

A subtlety worth tracing explicitly because it's the first thing readers worry about:

> *"Vendor A and Vendor B both serve zip `400055`. Does the buyer see both?"*

Yes, by construction:

1. Backend sync for Vendor A's product writes `400055` into `zips_<shard>` where `shard = crc32("400055") mod N`.
2. Backend sync for Vendor B's product writes `400055` into `zips_<shard>` — **same shard**, because the shard is a function of the zip alone, not vendor or product.
3. Buyer enters `400055` → JS computes the same shard → URL `?filter.p.m.shipturtle.zips_<shard>=400055`.
4. S&D matches **any** product whose `zips_<shard>` list contains `400055` — returns both vendors' products.

A third Vendor C who does *not* serve `400055` has no entry for it in any of their shards, so their products do not appear. Vendor isolation holds.

The shard is a property of the **zipcode**, not the vendor or product. Same zip → same shard, always, everywhere.

### 6.6 Confidence summary

| Layer | Confidence | Why |
|---|---|---|
| Math (shard determinism) | 100% | `crc32 mod N` is pure |
| Production correctness | **conditional on A–D being enforced** | Without the polyfill fixture, normalization function, and atomic N cutover, ~20% of edge-case zipcodes will produce wrong shards in v1 |

These invariants are not "polish" — they are load-bearing for correctness. The spec must call them out as P0 requirements before any code is written.

---

## 7. Capacity & Tuning

### 7.1 Capacity Table

Per-product coverage at various N values, after accounting for hash distribution variance (worst shard ~p99):

| N | Theoretical max | Safe practical max | Covers |
|---|---|---|---|
| 16 | 2,048 | ~1,700 | dense city, 5–10 km radius |
| **32** *(default)* | 4,096 | ~3,500 | London / UK nationwide outcodes |
| 64 | 8,192 | ~7,500 | multi-state India |
| 128 | 16,384 | ~15,500 | India nationwide |

### 7.2 How to Bump N Later

Increasing N is forward-only and non-destructive:

1. Register new metafield definitions `zips_<N_old>..zips_<N_new-1>`.
2. Re-run `SyncZipCodesWithProductsJob` for affected products.
3. Old data on `zips_0..zips_<N_old-1>` will be overwritten with the new distribution (because crc32 mod 32 and crc32 mod 64 produce different shard indices for the same zip).
4. Update the embed config's `shardCount` so JS computes against new N.
5. Cut over: deploy backend + theme together.

Until step 4 ships, the buyer side still uses old N → reads stale shard → stale results. So the cutover is **atomic per shop** but staged across shops.

### 7.3 Per-Shop N (optional)

`shops.hyperlocal_shard_count` (default 32). Large merchants (state-wide retail) can be bumped to 64 or 128 individually without affecting others.

---

## 8. Other Concerns Addressed

### Multi-vendor isolation (Problem 4)

Solved by §4.4 — each product gets only its own warehouses' zipcodes. No vendor namespace explosion. No cross-vendor leak.

### Silent failure UX (Problem 3)

Out of scope for this doc — see future "unserviceable UX" RFC. The architecture proposed here does not change empty-grid behavior; that's a theme + S&D quirk to fix separately.

### Cross-country collision (Problem 5)

Out of scope for the sharding design. Country scoping must be solved at the `hyperlocal_zipcodes` level (add `country_code` to coverage queries) before this proposal. Cross-cutting prerequisite.

### Operational opacity (Problem 6)

The sync rewrite is the right moment to add:
- `shop_hyperlocal_sync_logs` table — per-run row: shop_id, started_at, finished_at, product_count, success_count, fail_count, errors.
- Sentry breadcrumbs per product update.
- Per-shop counter metric: `hyperlocal_sync_products_total{shop_id,status}`.

Wire-up details to be designed alongside the sync job rewrite.

---

## 9. Open Decisions

| # | Open question | Recommendation |
|---|---|---|
| 1 | **Per-product → warehouses mapping**. Today the sync hits *all* company products with the same blob. The new sync needs to know which warehouses fulfill each product. Add `product_warehouse` pivot, or piggyback on existing inventory location, or derive from vendor relation? | **Grill needed.** Likely candidate: piggyback on existing vendor → warehouse → product chain (a product belongs to a vendor, the vendor has warehouses, all those warehouses fulfill the product). Need to verify the data is already this clean. |
| 2 | **Migration / dual-key cutover** for existing merchants. Today's single-key data must coexist with sharded keys while sync rolls out. | Run new sync writing both `<old_key>` and `zips_0..N-1` for a transition window, JS reads sharded if present, else falls back to old key. Remove old key after backfill verified. |
| 3 | **Module enable flow** — when do the N metafield definitions get created? On hyperlocal module enable, on first warehouse save, or eagerly at install? | On hyperlocal module enable. Idempotent. Existing `ChannelIntegrationApiManager::createMetaField()` already handles single definition; extend to loop N times. |
| 4 | **S&D filter registration** — does each shard key need to be manually toggled in S&D, or can we automate via admin API? | Investigate `metafieldStorefrontVisibility` + S&D filter API. Required: S&D must recognize all N keys as filterable without merchant intervention. |
| 5 | **Shard count change events** — when N changes for a shop, we need a one-shot full resync. | New job `RebuildHyperlocalShardsJob(shop_id)`. Triggered on N change. Idempotent. |
| 6 | **Unserviceable UX** | Separate RFC. Out of scope here. |
| 7 | **Observability + alerting thresholds** | Separate small spec. Sync log + Sentry + per-shop counter. |
| 8 | **Rollout** — feature flag, staged release, kill switch | Per-shop feature flag (`shops.hyperlocal_v2_enabled`). Off by default. Enable per shop after canary. |

---

## 10. Next Steps

1. **Resolve open decision #1** (product→warehouses mapping) — biggest unknown. Determines the entire sync rewrite.
2. **Spike on S&D filter registration via admin API** (open decision #4) — if not automatable, the whole plan needs a manual-step caveat.
3. **Write the sync job spec** once #1 is resolved.
4. **Write the migration plan** (open decision #2).
5. **Spec the unserviceable UX** (Problem 3) as a parallel workstream.

Items 1–4 are blocked on grilling. Item 5 can move independently.

---

## Appendix A — Why not a backend resolver API?

A natural-looking alternative: keep one Shopify metafield per product holding *a small token* (`vendor_id` or `warehouse_id`), and on the buyer side call a Shipturtle API to convert the buyer's zip into the list of tokens to filter on. URL becomes `?filter...=tok1&filter...=tok2...`.

Rejected because:

1. **OR-cardinality blows up in dense scenarios** — 1,000+ restaurants serving one Mumbai pincode → 1,000+ tokens in URL → S&D limits + URL length limits.
2. **API call on every collection page load** adds 50–200 ms blocking latency to page render; bad for LCP and SEO crawlers.
3. **Two systems of record** — Shipturtle now defines which products are servable, but Shopify renders them. Any drift = silent wrong results.

Sharded metafields keep the buyer-side path 100% Shopify, no Shipturtle call in the hot path.

## Appendix B — Why not geohash?

Geohash is excellent when you own the storefront and run a custom proximity index (Zomato, Swiggy). It's the wrong fit here for two reasons:

1. **Buyers type pincodes, not coordinates.** Mapping pincode → lat/lng is itself an extra DB lookup. We'd be paying complexity for no precision gain because pincodes are already the unit of coverage in our merchant configuration.
2. **Geohash clusters nearby zips into the same bucket.** That is the *opposite* of what our sharding needs (we want flat distribution to maximize per-shard headroom). A merchant in Mumbai would dump all coverage into 1–2 geohash buckets, blowing the 128 cap. Random uniform hashing (crc32) gives the flat distribution we need.

Geohash is the right answer to a different question.
