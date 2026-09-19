# Digital Signage for the Shop — Product & Technical Requirements Document

**Owner:** Brian Maggi
**Businesses served:** Word on the Street Books (2044 First Street, Livermore) and Showmentum
**Status:** Draft v7 — ORM switched from Prisma to Drizzle (better-sqlite3 driver); stack otherwise unchanged (Next.js + Tailwind, single app + worker service, containerized hosting on a separate host Mac)
**Date:** September 18, 2026

---

## 1. Overview & Vision

We're building a self-hosted digital signage system to run on a spare Mac connected to a TV via AirPlay in the shop (2044 First Street). The system displays a looping sequence of "blocks" — images, short videos, and dynamically-generated content like upcoming events — to promote the shop, cross-promote Showmentum events, highlight community content, and add ambiance/personality to the space.

The system is built to run entirely on local hardware (Mac + Docker + SQLite/Postgres) but architected as if it might scale to the cloud or to multiple locations later (e.g., additional displays, remote management).

WordPress (with Pods and The Events Calendar) is the primary source of structured, recurring content — Events, Community Board, and Featured Readers — rather than a separate signage-specific CMS. WordPress's media library, and now WooCommerce's product catalog (itself synced from Square), supply the visual/product assets so nothing is re-entered or duplicated. See §6 for the full picture.

### Goals
- Give Brian a fast way to publish and rotate promotional content without touching code.
- Let content that already belongs in WordPress/WooCommerce (events, community submissions, featured readers, book data) drive signage templates directly, with **no duplicated source of truth** — book title/author/cover always trace back to the single WooCommerce (Square-synced) product record.
- Let content with a natural shelf life be scheduled where it's authored in WordPress; general store content simply runs evergreen with no dates at all.
- Let reusable content (a reader, a recommendation) be **written once and reused across time** — e.g., the same October Halloween book recommendation can resurface every October without recreating it.
- Automatically pull in upcoming events from the WordPress site so the board never goes stale.
- Support both simple static content (posters, QR codes) and richer content (video clips, templated data-driven slides).
- Allow manual, drag-and-drop control over what plays and when, plus automated/dynamic behavior (expiring content, pulling fresh event/community data, near-real-time correction of typos or mistakes).
- Look professional: consistent 16:9 layout, template-driven design for recurring content types.
- Make it easy to back up and restore a full sequence ("show") so curated content isn't at the mercy of a single machine.

### Non-goals (v1)
- Multi-location / multi-display fleet management (architected for, not built for, in v1). Confirmed: only one display at a time for v1.
- Touch interactivity on the display itself (playback is passive/one-way).
- A public-facing, self-serve CMS for outside contributors — community board content is still curated by Brian, via a WordPress-native approval flow (§6.2).
- Remote/cloud access to the admin UI — confirmed not needed: the signage only runs while Brian/staff are in the store, so local-network-only access is sufficient for v1 (see §12).

---

## 2. Key Concepts & Vocabulary

| Term | Definition |
|---|---|
| **Block** | The atomic unit of content — one "slide" (image), a self-contained video clip, or a dynamically rendered template (e.g., an event card, a community board post, a featured reader recommendation). Always 16:9. |
| **Category** | A tag on a block describing its content type/purpose (e.g., Event, Community Board, Featured Readers, General, Fun). Categories can carry a default template and default duration. |
| **Template** | A reusable layout with placeholder fields (text, image) that a category's content is plugged into. |
| **Schedule** | Start date (when content enters rotation) and optional expiration date (when it's automatically pulled from rotation). No expiration = evergreen/indefinite. For WordPress-sourced content with a shelf life, scheduling can be authored directly on the WordPress post — either as explicit dates or, for Featured Readers, via a reusable "Feature Period" taxonomy (see §6.3). |
| **Sequence ("Show")** | An ordered, named list of blocks that plays back linearly and loops. Brian can maintain multiple sequences and choose which is live. |
| **Data Source** | An external feed a dynamic block pulls from. In v1, this is primarily **WordPress** — The Events Calendar's REST API, a Pods-powered custom post type's REST API, or a small custom "Signage REST" endpoint (§6.4) — with CSV as a fallback. |
| **Pods** | Brian's existing WordPress plugin for defining custom post types/taxonomies and custom fields (including fields added to *existing* types like WooCommerce Products), with automatic REST API exposure. |
| **Feature Period** | A reusable month/year tag (e.g., "October 2026") applied to Featured Reader recommendations, so a single recommendation can be attached to multiple periods over time instead of being recreated. See §6.3. |
| **Player** | The Mac + browser (or lightweight app) that renders the active sequence full-screen and AirPlays it to the TV. |

---

## 3. Content Model — Blocks

### 3.1 Block Types

1. **Static Image Block** — a single image (poster, QR code graphic, announcement). Duration is configurable per-block, defaulting to a read-comfortable value (proposed default: 10s for text-light images, 15s for text-heavy; see §3.3).
2. **Video Block** — an MP4 (or similar) clip. Duration is derived automatically from the file's length. Playing the whole file is sufficient for v1 — no in/out trimming. Source can be a direct upload or a video attachment from the WordPress media library.
3. **Dynamic/Templated Block** — content rendered from a template + a data source (WordPress events feed, a Pods-powered WordPress content type, or CSV). Has a *default* duration that can be overridden per-block or per-category. See §3.4 for how multi-item dynamic content is handled.

### 3.2 Common Block Properties

Every block, regardless of type, has:
- `id`
- `name` / internal label (for Brian's own organization — not shown on screen)
- `category` (Event, Community BB, Featured Readers, General, Fun — extensible list; see §3.5)
- `type` (static_image | video | dynamic_template)
- `aspect_ratio` — fixed at 16:9; assets that don't match are letterboxed/cropped per a configurable per-block fit mode (`cover`, `contain`, `contain-with-blurred-background`)
- `start_date` (defaults to "now"/immediately active)
- `end_date` (nullable — null means "runs indefinitely")
- `duration_seconds` (explicit for static/dynamic; computed for video)
- `status` (draft, active, expired, archived) — computed from schedule + manual archive flag
- `created_at`, `updated_at`
- Membership in one or more **sequences**, each with its own position/order

For dynamic blocks whose data originates in WordPress, `start_date`/`end_date` come from **wherever the content type defines them** — explicit dates for Community Board, a Feature Period taxonomy term for Featured Readers, or nothing at all for evergreen content. See §6.6.

### 3.3 Duration Defaults

| Block type | Default duration | Override? |
|---|---|---|
| Static image | 10s baseline; longer default (15–20s) when a manual "text-heavy" toggle is set | Yes, per block |
| Video | Actual file duration (probed via ffprobe) | No override in v1 |
| Dynamic/templated | Category-level default (e.g., Events = 12s/card, Featured Readers = 10s/recommendation) | Yes, per block or per data item |

### 3.4 Dynamic Blocks & Multi-Item Data

A dynamic block pulls a list of items from a data source at render/refresh time. v1 supports two display modes, selectable per block:

- **Carousel mode**: each item becomes its own on-screen slide with full details, cycling through N items at the block's per-item duration.
- **List mode**: multiple items are laid out on one template as a list, shown for a single fixed duration, with a user-defined item count and a user-defined label (e.g., "Coming Soon," "October's Featured Readers").

Brian picks the mode (and, for List mode, the item count and label) per dynamic block, capped at a configurable max item count. For Featured Readers specifically, the natural expectation is that **all** recommendations tagged with the current Feature Period show up (not just a top-N), since a slow month might have one reader and a busy month might have five — see §6.3.

### 3.5 Categories

Seeded categories:
- **Event** — pulls from WordPress events feed (The Events Calendar); uses Event template
- **Community Board** — pulls from a Pods custom post type; uses Community BB template
- **Featured Readers** — pulls from Pods-managed Reader and Recommendation content, filtered by Feature Period; uses Featured Reader template (see §3.6 and §6.3)
- **General** — shop promo, book recommendations, hours, WiFi info; typically evergreen, uploaded directly or sourced from WordPress
- **Fun** — quotes, trivia, ambiance content

Each category has a default template (optional), a default duration, and a default color/badge in the admin UI.

**Community Board intake workflow:**
1. A Pods custom post type (e.g., `signage_community_board`) with fields matching the Community BB template: headline, body text, featured image, **start date, end date**, optional link/QR target, and an `approved` checkbox.
2. A WPForms form collects submissions from community partners.
3. Brian reviews submissions and creates/approves the Pods post — either via the WPForms Post Submissions add-on (auto-creates a draft post) or manually.
4. The signage backend only pulls posts where `approved` is checked and `post_status = publish`.

### 3.6 Templates

v1 ships with three built-in templates:

1. **Event Template** — event title, date/time, short description, featured image, location, price/ticket info (optional), auto-generated QR code.
2. **Community Board Template** — headline, body text, image/flyer, optional QR code, optional date range shown on-screen.
3. **Featured Reader Template** — reader name, optional reader photo, book title, author, book cover image, recommendation blurb, optional "buy this book" QR code linking to the WooCommerce product page. **All book fields (title, author, cover image, purchase link) are pulled live from the related WooCommerce product — never re-entered** — see §6.3.

**Image fields are sourced from WordPress/WooCommerce wherever possible:**
- The **Featured Image** on a post (Event, Community Board) is the default source for a template's primary image field.
- For Featured Readers, the book cover comes from the **related WooCommerce product's** featured image, not a separately-uploaded or hand-linked image.
- Register a dedicated WordPress image size (e.g., `add_image_size('signage_169', 1920, 1080, true)`) for a consistent hard 16:9 crop, exposed via REST alongside the original, applied to both regular media and — as far as WooCommerce's product image handling allows — product images used on signage. Brian can still hand-crop on the WordPress side if the auto-crop picks a bad focal point.

**Template engine approach:** HTML/CSS layouts with mustache/handlebars-style placeholders, rendered in the same browser-based engine used for static content. Each template defines fallback behavior for missing fields (e.g., no image → solid brand-color background).

---

## 4. Scheduling

- Every block has `start_date` and optional `end_date`; eligibility is `start_date <= today` and (`end_date` is null or `end_date >= today`).
- No `end_date` = evergreen, runs indefinitely.
- Expired blocks are automatically excluded from playback but remain in the system (status = `expired`) for reuse.
- For WordPress-sourced dynamic blocks, scheduling is driven by the source content itself: explicit dates for Community Board, Feature Period taxonomy membership for Featured Readers, event date/time for Events. See §6.6.

---

## 5. Sequences ("Shows")

- A **Sequence** ("show") is a named, ordered collection of block references (a block can belong to multiple sequences).
- Brian can maintain multiple sequences but only one is "live" at a time (v1). Switching is a single action in the admin UI.
- **Manual ordering:** drag-and-drop reordering in the admin UI.
- **Dynamic ordering:** an optional auto-insert mode (e.g., "insert an event block every 4 blocks") or an auto-fill pool that cycles through active Community Board/Fun/Featured Reader blocks after a set of pinned blocks.
- At playback time, the sequence is "resolved" into an ordered play-list of only currently-eligible blocks, with dynamic/multi-item blocks expanded into their sub-items.
- The player re-resolves the sequence periodically (e.g., every 5 minutes) so expirations, new content, and fresh WordPress data show up without a manual restart — and see §6.9 for how n8n can push updates in even faster when Brian needs to fix something right away.
- Scheduled auto-switching between sequences remains a deferred v2 feature.

---

## 6. WordPress as the Primary Content Source

WordPress (with Pods, The Events Calendar, and WooCommerce) is the system of record for structured, recurring content. The signage backend treats it as read-only: it syncs data in, caches it locally, and never writes back.

### 6.1 Events (The Events Calendar)

- **Source:** `https://www.wordonthestreetbooks.com/events/`, built on The Events Calendar plugin.
- **Integration method:** REST API at `/wp-json/tribe/events/v1/events`, polled on a schedule.
- Fields map into the Event template; a QR code is auto-generated per event.
- Past or removed events drop out of rotation automatically on next sync.
- If the feed is unreachable, the last successfully synced data continues to display, with a warning in the admin UI.

### 6.2 Community Board (Pods custom post type)

- **Source:** `signage_community_board` Pods post type, exposed via Pods' REST API support.
- **Integration method:** poll the post type's REST route, filtered to published + approved posts.
- **Intake workflow:** see §3.5.
- Same resilience/caching behavior as Events.

### 6.3 Featured Readers — Redesigned Around a Reusable Model

Three pieces, designed specifically to avoid duplicating book data and to make readers/recommendations reusable across months:

**1. `signage_reader` (Pods CPT)** — one post per featured reader: name, optionally a photo and short bio. Fully reusable — a reader who was featured in March can be featured again in November without recreating anything.

**2. `signage_recommendation` (Pods CPT)** — the write-up itself:
- `reader` — Pods **relationship field** → `signage_reader` (who's recommending)
- `book` — Pods **relationship field** → the actual **WooCommerce product** (`product` post type). This is the key change: book title, author, and cover image are **never re-entered or linked by hand** — they're pulled live from the product record, which is itself synced from Square. If a cover image or title ever changes upstream, the recommendation slide updates automatically. See the note below on adding an Author field if products don't already have one.
- `blurb` — the reader's write-up about the book
- *(optional)* a day-level `start_date`/`end_date` override, for the rare case Brian wants a recommendation to appear for something other than its full tagged period(s)

**3. `signage_feature_period` — a Pods-managed taxonomy, not a post type** — this is the reusability mechanism Brian's asking for. Terms look like "October 2026" (slug `2026-10`, so terms sort correctly), and a `signage_recommendation` post can be tagged with **one or more** periods, the same way a blog post can have multiple categories. This directly solves the reuse case:

- **Multiple featured readers per month** → just tag multiple recommendation posts with the same period term.
- **Reusing a reader later** → the reader post never changes; a new recommendation just relates back to the same `signage_reader`.
- **Reusing a recommendation for a themed month** → a Halloween book recommendation gets tagged with `2026-10`, and when October 2027 rolls around, Brian just adds the `2027-10` term to that *same* post — no duplicate content, no copy-pasting a blurb.

Since Pods can add custom fields to taxonomies too, `signage_feature_period` could optionally carry its own fields later (e.g., a theme note like "Spooky Reads" or a period-level banner image) if Brian ever wants a themed intro slide — not needed for v1, but worth knowing the model supports it without restructuring.

**Automatic "current month" resolution.** The Featured Readers data source can be configured to resolve "whatever period term matches today's year-month" automatically (computing the `YYYY-MM` slug at sync time) rather than Brian having to update a block's config every month. This means Brian can tag next month's recommendations in advance, and rotation just happens on the 1st with zero touching of the signage app itself. A block can alternatively be pinned to a specific period (useful for previewing next month's lineup before it goes live).

**Note on the Author field:** if WooCommerce products don't already store author cleanly (many bookstores put it in the title, e.g. "Dracula — Bram Stoker"), Pods can **extend the existing `product` post type** with a proper `Author` field, rather than adding it to the Recommendation. That keeps *all* book metadata on the one product record — still a single source of truth — rather than splitting author onto the recommendation and everything else on the product.

**Integration method:** see §6.4 below — given how many relationships are now involved (reader, product, period), a small custom REST endpoint on the WordPress side is the recommended way to keep this manageable, rather than having the signage backend stitch multiple Pods/WooCommerce REST calls together itself.

Display mode: Carousel (each recommendation as its own detailed slide) is the natural default, cycling through everyone tagged with the current period; List mode is available for a "This Month's Featured Readers" round-up slide.

### 6.4 Recommended: A Small Custom "Signage" REST Endpoint

With three related content types feeding one template (reader + recommendation + product, joined through a taxonomy), asking the signage backend to make three separate REST calls per item and stitch them together works, but it's fragile and pushes WordPress-specific knowledge into the signage codebase. A cleaner pattern, and one worth using for Featured Readers (and optionally Community Board/Events too, later):

- Add a tiny custom plugin (or a few functions in a must-use plugin) that registers a purpose-built REST route, e.g.:
  - `GET /wp-json/signage/v1/featured-readers?period=2026-10` → returns an array of already-joined objects: `{ reader: { name, photo_url }, book: { title, author, cover_url, product_url }, blurb }` — exactly the shape the signage template needs, in one call.
  - `GET /wp-json/signage/v1/featured-readers?period=current` → same, but resolves "this month" server-side (in PHP, using WordPress's own date handling) instead of the signage backend having to compute it.
- This keeps all the Pods-relationship-walking and WooCommerce-product-lookup logic in WordPress/PHP, where Brian already has the domain knowledge, and gives the signage backend one clean, stable contract to sync against — a genuine "data source" in the sense §7/§10 already describe, just backed by a custom endpoint instead of Pods' auto-generated REST routes.
- The same pattern is a natural home for the current-month auto-resolution described in §6.3, and for future additions (e.g., joining Announcements to a period, or flattening Community Board's fields) without the signage backend needing to change at all — new fields just show up in the same JSON shape.
- This is a small amount of PHP (a handful of `register_rest_route()` calls with WP_Query/Pods API lookups), well within reach given Brian's existing WordPress/Pods comfort, and it's the kind of thing worth building once Featured Readers' data model is finalized.

If Brian would rather not maintain custom PHP, the fallback is the signage backend doing the multi-hop resolution itself (fetch recommendation → follow `reader` and `book` relationship IDs → fetch each) — more moving parts on the app side, but zero WordPress code beyond Pods configuration. Worth deciding (see §14).

### 6.5 Other WordPress-Driven Content — Options for Brian

Still worth considering for later phases, not required for v1:
- **Staff Picks / New Arrivals from WooCommerce**, filtered by a product tag — no new content type needed, and would reuse the same "relate to the product, don't duplicate" pattern established for Featured Readers.
- **General announcements** as a lightweight `signage_announcement` Pods type for one-off notices.
- **Latest blog post** as a rotating "what's new" slide.

None of these are required for v1 — the data-source abstraction (§10) is generic enough that adding any of them later is a config change.

### 6.6 Shelf-Life Scheduling: What Lives in WordPress

| Content type | Scheduling |
|---|---|
| Events | Driven entirely by the event's own date/time from The Events Calendar. |
| Community Board | Explicit `start_date`/`end_date` Pods fields on the post — Brian sets a flyer's run window right on the post. Both blank = runs until manually unpublished. |
| Featured Readers | Driven by **Feature Period taxonomy membership** (§6.3), not explicit dates — a recommendation is "in rotation" whenever it's tagged with the current period. The optional per-recommendation date override exists for edge cases but isn't the primary mechanism. |
| General / evergreen store content | No dates at all by default — it's about the store itself, so it simply runs indefinitely until Brian archives or replaces it. |

This means the *signage admin's* own per-block `start_date`/`end_date` fields (§3.2) are mainly for content Brian uploads directly (static images, videos) — WordPress-sourced content schedules itself, using whichever mechanism fits the content type.

### 6.7 Assets from the WordPress Media Library

- **Featured Image** is the default/primary image source for any WordPress-driven template field on Events and Community Board.
- For Featured Readers, the book cover comes from the related **WooCommerce product's** image, not the media library directly (though the product's image does live in the media library under the hood).
- The signage backend **caches** referenced media locally (downloaded once per asset, keyed by attachment/product ID + a content hash), re-downloading only when the source changes.

### 6.8 Sync Architecture, Including Real-Time Updates via n8n

**v1 default: polling.** The signage backend (or the custom Signage REST endpoint, per §6.4) is polled on a configurable interval (e.g., every 30–60 minutes). Simple, self-contained, no extra moving parts.

**For real-time corrections (e.g., fixing a typo and wanting it live immediately), add an n8n-driven push path on top of polling rather than replacing it.** Practical tips for building this:

1. **Trigger on the WordPress side.** A small snippet on `save_post` (or `save_post_{post_type}` for just the signage-relevant post types) in a must-use plugin or `functions.php`, calling `wp_remote_post()` to hit an n8n Webhook node with the post ID and post type. If you'd rather not touch code, the free **WP Webhooks** plugin can fire on post save/update/trash without any PHP.
2. **n8n workflow shape:** Webhook trigger → (optional) a short **Wait** node to debounce rapid successive saves → an **HTTP Request** node that calls the signage backend directly.
3. **Prefer a targeted upsert over a full re-sync.** Have n8n call a single-item endpoint (e.g., `POST /api/data-sources/:id/sync?post_id=123`) so only the edited post is re-fetched and re-cached — this is what makes the correction feel instant.
4. **Secure the webhook.** Give the signage backend's sync endpoint a shared-secret header and have n8n's HTTP Request node send it. Reject calls without it.
5. **Keep polling as a safety net.** If a webhook call fails (WordPress down, n8n down, network blip), the next poll self-heals without anyone noticing.
6. **Closing the last gap — the player itself.** Either shorten the player's poll interval (e.g., to 30–60 seconds) or add a manual "Refresh Now" button in the admin UI for the moment Brian wants to *see* the fix land immediately.
7. **Optional: catch failures.** n8n's built-in Error Workflow feature can notify Brian if the webhook call to the signage backend fails repeatedly.

This keeps all the "when does content change" logic in n8n, which is where Brian already does this kind of work, rather than building bespoke webhook-handling into the signage backend.

### 6.9 WordPress Site Organization Recommendations

A few structural suggestions, beyond the Featured Readers model itself, to keep this maintainable as more signage content types get added:

- **Consistent naming.** Keep the `signage_*` prefix convention for every Pods post type and taxonomy built for this project (`signage_community_board`, `signage_reader`, `signage_recommendation`, `signage_feature_period`, and any future `signage_announcement`) — makes them easy to spot in the WP admin and in REST routes, and easy to distinguish from Brian's other WooCommerce/Showmentum-related content types if those ever get added to the same site.
- **Group them in the admin menu.** Pods lets you assign custom post types to a shared top-level admin menu group (e.g., a single "Signage" menu) instead of each type cluttering the main WordPress sidebar separately — worth setting up once, since Brian will be in these screens monthly for Featured Readers and ad hoc for Community Board.
- **Turn on bidirectional relationships.** When setting up the `reader` and `book` relationship fields on `signage_recommendation`, enable Pods' bidirectional option so a Reader's edit screen shows their past recommendations, and (if useful) a Product's edit screen shows which recommendations reference it — handy for "has this book already been featured?" at a glance without a separate report.
- **Extend, don't duplicate, existing post types.** The Author-field decision in §6.3 is one instance of a broader pattern worth keeping in mind: when a piece of data conceptually belongs to something that already exists in WordPress/WooCommerce (a product, an event), extend that type with a Pods field rather than creating a new field on the signage-specific post type that references it. Keeps the "no second source of truth" principle consistent as more content types get added.
- **Slug periods as `YYYY-MM`.** Ensures WordPress's default alphabetical term sorting also happens to be chronological, and gives the "current month" auto-resolution (§6.3) a predictable value to compute against — no ambiguity between "Oct 2026" / "October 2026" / "10-2026" as different strings.
- **Consider the custom REST endpoint (§6.4) as the long-term pattern**, not a one-off for Featured Readers — as more content types accumulate relationships (Community Board could eventually relate to a submitter, Events already has rich nested data), a small, deliberately-shaped `signage/v1/...` REST namespace keeps the "what does the signage app actually need" contract explicit and stable, independent of how the WordPress-side data model evolves underneath it.

---

## 7. CSV / Fallback Data Sources

- A generic **CSV import** capability remains available for anything that doesn't have a natural home in WordPress, or as a stopgap before a Pods content type exists for something.
- CSV can be uploaded manually through the admin UI in v1.
- The data-source abstraction is generic: a data source resolves to a list of field-value objects matching a template's schema, whether it's WordPress (via Pods REST or the custom Signage endpoint), CSV, or something added later.

---

## 8. Playback / Player

- **Hardware:** Mac Mini (or similar) connected to a TV via AirPlay. Single display for v1.
- **Rendering approach:** full-screen browser (Chromium in kiosk mode) pointed at a local web app served by the signage backend.
- **AirPlay:** native macOS screen mirroring — no special app-level integration required.
- **Playback loop:** fetches the resolved play-list for the live sequence, plays each item for its duration, advances, loops; re-polls the backend periodically (tunable — see §6.8, point 6, for tightening this for near-real-time correction).
- **Reliability:** auto-reconnect/retry on network hiccups, auto-restart on crash, safe fallback if the backend is unreachable.
- **Preview:** live preview in the admin UI, with a manual refresh option (§6.8).

---

## 9. Content Management (Admin UI)

Core screens/flows:
1. **Block Library** — filterable by category/status/type/source (locally uploaded vs. WordPress-synced).
2. **Block Editor** — per block type, including picking a WordPress/Pods data source and display mode for dynamic blocks; for Featured Readers, picking "current month" vs. a pinned period.
3. **Sequence ("Show") Builder** — drag-and-drop ordering, live/auto-fill configuration.
4. **Template Manager** — view/edit the built-in templates (Event, Community Board, Featured Reader).
5. **Data Sources** — view configured WordPress/CSV sources, sync status, manual sync trigger, and webhook/n8n integration status if configured (§6.8).
6. **Live Preview / Player Status**, with a manual "Refresh Now" action.
7. **Import / Export** — back up or restore a show; see §13.
8. **Settings** — WordPress site URL, per-content-type REST endpoint/mapping config, sync interval, webhook shared secret, default durations per category, display resolution.

---

## 10. Data Model (High-Level)

```
Block
  id, name, category_id, type, status
  start_date, end_date
  duration_seconds (nullable — computed for video)
  fit_mode
  created_at, updated_at

  StaticImageBlock: image_asset_id, text_heavy (bool)
  VideoBlock: video_asset_id, duration_seconds (probed)
  DynamicBlock: template_id, data_source_id, display_mode (carousel|list),
                per_item_duration, max_items, list_label (nullable), field_overrides (JSON)

Category
  id, name, default_template_id (nullable), default_duration_seconds, color

Template
  id, name, category_id (nullable), schema (JSON: field name -> type [text|image|qr|date]),
  html_template, css

DataSource
  id, name, type (wordpress_events | wordpress_pods | wordpress_custom_rest | csv | manual)
  config (JSON):
    -- wordpress_events: base_url, sync_interval
    -- wordpress_pods: base_url, post_type, rest_route, approved_field (nullable),
                        relationship_fields, field_mapping, sync_interval
    -- wordpress_custom_rest: base_url, route (e.g. /wp-json/signage/v1/featured-readers),
                               period_mode (current_month|fixed), period_slug (nullable),
                               sync_interval
    -- csv: file path/upload, column_mapping
  last_synced_at
  webhook_secret (nullable — for n8n-authenticated push updates)

Sequence ("Show")
  id, name, is_live (bool)

SequenceBlock (join table)
  sequence_id, block_id, position, pinned (bool, for auto-fill logic)

Asset
  id, type (image|video), file_path, mime_type, width, height, duration_seconds (video),
  file_size, checksum, source (upload|wordpress_media|woocommerce_product),
  wp_attachment_id (nullable), source_product_id (nullable), uploaded_at, cached_at (nullable)

SyncLog
  id, data_source_id, run_at, status, items_fetched, error_message, trigger (poll|webhook)
```

---

## 11. Technical Architecture

**Stack decision:** built with **Next.js (App Router, TypeScript) + Tailwind CSS**, per Brian's preference and existing familiarity. One Next.js app serves the admin UI, the player's rendering routes, and the API — replacing the earlier separate "React SPA + Express backend" split with a single codebase and a single deployable container. A small companion **worker** process (also Node/TypeScript, sharing the same Drizzle client) handles the one thing Next.js's request/response model isn't suited for: long-running scheduled polling.

### 11.1 High-Level Components

```
                         Next.js app (single container: "web")
                         ---------------------------------------
                         /admin/*      - Block Library, Block Editor, Sequence
                                         Builder, Template Manager, Data Sources,
                                         Live Preview, Import/Export, Settings
                         /player       - Full-screen render route the kiosk
                                         browser points at
                         /api/*        - Route Handlers: blocks, sequences,
                                         templates, data-sources, assets,
                                         export/import, player status,
                                         n8n webhook receiver (event-driven,
                                         fine as a normal request)
                         Drizzle ORM ----------------------------
                                                |
                                                v
                         DB: SQLite (v1) / Postgres (scale path)
                         Local volume for cached & uploaded assets

                         Worker container: "worker"
                         ---------------------------------------
                         node-cron loop (shares the same Drizzle client/DB):
                           - WordPress/Pods/custom-REST polling (§6.8)
                           - Block expiration sweep (§4)
                         (NOT the webhook receiver — that's a normal Next.js
                          API route, since it only needs to react per-request)

Kiosk browser (native process on the host Mac, NOT containerized)
                         ---------------------------------------
                         Chromium --kiosk http://localhost:3000/player
                         (needs direct access to the display/AirPlay)

WordPress: Pods relationships (Reader, Recommendation -> Product) + signage_feature_period taxonomy
        --> custom signage/v1 REST endpoint (joins reader + product + blurb server-side)
        --> "worker" polls this endpoint like any other data source

WordPress save_post hook (or WP Webhooks plugin)
        --> n8n Webhook trigger --> [debounce] --> HTTP Request (targeted upsert)
        --> Next.js API route (single-item sync), authenticated with a shared secret
```

### 11.2 Stack Recommendation

- **Framework:** **Next.js 15, App Router, TypeScript** — one codebase for admin UI, player rendering, and API (Route Handlers), matching Brian's existing familiarity.
- **Styling:** **Tailwind CSS**, per Brian's preference.
- **Database:** SQLite for v1, via **Drizzle ORM** (`better-sqlite3` driver; schema maps directly onto §10's data model), swappable for a Postgres driver on a later scale path.
- **Drag-and-drop (Sequence Builder):** `dnd-kit`, works fine inside a Next.js client component.
- **Background polling:** a small standalone **worker** service (plain Node/TypeScript + `node-cron`, importing the same Drizzle client/schema as the Next.js app) — see the note above on why this needs its own long-running process rather than living inside a Next.js request handler.
- **Video processing:** `ffmpeg`/`ffprobe`, invoked from a Route Handler or the worker on upload/sync.
- **QR generation:** server-side QR library (`qrcode` npm package), generated in a Route Handler and cached as an asset.
- **WordPress integration:** REST calls against `/wp-json/tribe/events/v1/...`, Pods' REST-exposed post type endpoints, and the recommended custom `/wp-json/signage/v1/...` namespace (§6.4) — all made from the worker (polling) and from Route Handlers (manual sync, preview, webhook receiver).
- **Player rendering:** the `/player` route itself — a Next.js page that fetches the resolved sequence and renders each block client-side (timers for image/dynamic blocks, `<video>` element for video blocks), rather than a separate frontend app. The kiosk browser just points at this URL.
- **Containerization:** Docker Compose with two services sharing one Postgres/SQLite volume and one assets volume: `web` (the Next.js app, built with `next build` / run with `next start`) and `worker` (the polling/cron process). The kiosk browser runs natively on the host Mac, outside Docker, since it needs direct display/AirPlay access.

### 11.3 API Design (illustrative)

Implemented as Next.js Route Handlers under `app/api/...` — same endpoints as before, now colocated with the UI in one app:

- `GET/POST/PUT/DELETE /api/blocks`
- `GET/POST/PUT/DELETE /api/sequences`
- `PUT /api/sequences/:id/reorder`
- `POST /api/sequences/:id/activate`
- `GET /api/sequences/:id/resolve` — also what `/player` calls server-side (or client-side on its poll interval) to get the current play-list
- `GET/POST /api/templates`
- `GET/POST /api/data-sources`, `POST /api/data-sources/:id/sync` (full sync — callable manually from the admin UI or by the worker on its schedule)
- `POST /api/data-sources/:id/sync?post_id=X` — targeted single-item upsert, for n8n's webhook push
- `GET /api/data-sources/:id/preview`
- `POST /api/assets`, `POST /api/assets/sync-from-wordpress`
- `GET /api/player/status`, `POST /api/player/heartbeat`
- `POST /api/player/refresh-now` — manual force-refresh for the live preview/player
- `GET /api/sequences/:id/export`, `POST /api/sequences/import`
- `GET /api/export/full`, `POST /api/import/full`

### 11.4 Deployment Model

- **Development machine:** this Mac, for now — `npm run dev` against a local SQLite file while building out Phase 1.
- **Host machine:** a **separate Mac** (the one with the AirPlay-connected TV) running Docker Desktop (or the lighter Colima/OrbStack). This is the machine the two containers (`web`, `worker`) and the kiosk browser process actually run on, day to day.
- **Persistent volumes** for the SQLite file and the assets folder, mounted from the host filesystem so `docker compose down`/`up` never loses data — this is also what §13's Import/Export and any filesystem-level backup script target.
- **Auto-start on boot:** a `launchd` entry on the host Mac to run `docker compose up -d` at login/boot, plus the existing launchd entry for the kiosk browser (§8) — together these mean a power blip or reboot self-heals without Brian needing to be on-site.
- Architecturally portable to a cloud VM later (swap SQLite → Postgres) without a rewrite, per the original goals — this deployment section just makes the near-term "two Macs" reality concrete.

### 11.5 Hosting on a Separate Mac — Step by Step

Since development happens here and the container needs to run on a different physical Mac, there are three reasonable ways to get the built app onto that machine. All three are one-time setup; pick based on how much ongoing convenience vs. simplicity Brian wants.

**Option A — Git clone + build on the host Mac (recommended for now).** Simplest, no registry or image-transfer step, and matches "build here, host there" directly:
1. Push the Next.js project to a private Git repo (GitHub is the natural choice given Brian's existing tooling).
2. On the host Mac: install Docker Desktop (or Colima/OrbStack), then `git clone` the repo.
3. `docker compose build && docker compose up -d` — builds both the `web` and `worker` images locally on the host Mac and starts them.
4. **To ship an update later:** `git pull && docker compose up -d --build` on the host Mac. A short SSH session or Brian being physically at the machine is all that's needed — no separate publishing step.
5. Works regardless of whether the two Macs have the same chip (Intel vs. Apple Silicon), since the image is built natively on the host machine each time.

**Option B — Build here, push to a container registry, pull on the host Mac.** More moving parts, but means the host Mac never needs the source code or a build step — useful once updates become frequent and Brian wants a push-button deploy:
1. Create a (free, private) repository on GitHub Container Registry (`ghcr.io`) or Docker Hub.
2. On this dev Mac: `docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/<brian>/signage-web:latest --push .` (multi-arch build, so it works whichever chip the host Mac has — important if the dev Mac and host Mac aren't the same architecture).
3. On the host Mac: `docker login ghcr.io`, then `docker compose pull && docker compose up -d` (with `docker-compose.yml` referencing the registry image tags instead of local `build:` contexts).
4. **To ship an update:** rebuild/push from the dev Mac, then `docker compose pull && docker compose up -d` on the host Mac.

**Option C — Direct image transfer (no registry, no git needed on the host Mac).** Useful for a one-off or air-gapped setup, but doesn't scale well for ongoing updates and requires matching CPU architecture between the two Macs (both Apple Silicon, or both Intel) unless built multi-arch as in Option B:
1. On this dev Mac: `docker compose build`, then `docker save signage-web signage-worker | gzip > signage-images.tar.gz`.
2. Transfer the file to the host Mac (AirDrop, USB drive, or a network share).
3. On the host Mac: `docker load < signage-images.tar.gz`, then `docker compose up -d` (with `docker-compose.yml` referencing the now-local image names rather than a `build:` context).

**First-time setup checklist on the host Mac (any option):**
1. Install Docker Desktop / Colima / OrbStack.
2. Get the compose project onto the machine (via A, B, or C above).
3. Copy over an `.env` file with any secrets (WordPress base URL, n8n webhook shared secret) — never commit this to git.
4. `docker compose up -d` and confirm `http://localhost:3000/admin` loads.
5. Set up the kiosk browser launchd agent (§8) pointed at `http://localhost:3000/player`.
6. Set up the Docker Compose auto-start launchd entry (§11.4) so both containers come back after a reboot.
7. Do a first Import (§13) if there's already a "show" built up on the dev machine to bring over, or just start building sequences fresh in the admin UI.

- Backups: manual Import/Export (§13) plus a scheduled filesystem-level backup of the host Mac's mounted volumes, as a lower-level safety net.

---

## 12. Non-Functional Requirements

- **Display:** 16:9 throughout; HD and 4K supported.
- **Reliability:** player recovers automatically from crashes/network blips; WordPress sync failures degrade to stale-but-available data.
- **Performance:** sync (poll or webhook-triggered) shouldn't cause visible playback stutter.
- **Security:** admin UI is local-network-only, no login/auth required in v1. The n8n webhook endpoint requires a shared secret. WordPress sync is otherwise read-only.
- **Maintainability:** clear conventions, single-command local dev setup, minimal moving parts. The custom Signage REST endpoint (§6.4) trades a small amount of WordPress-side PHP for a meaningfully simpler signage backend.

---

## 13. Import / Export ("Show" Backup & Restore)

### 13.1 What Gets Exported

- **Show export** — a sequence's definition, its blocks' configuration, dependent templates/categories, and data source configs — not the live WordPress-synced data, which re-syncs fresh after import.
- **Full system export** — everything: sequences, blocks, templates, categories, data source configs (including any configured n8n webhook secret, which should be treated carefully on restore), and cached/uploaded assets.

### 13.2 Bundle Format

```
export.zip
  manifest.json      -- schema version, export type (show|full), export date,
                          sequences[], blocks[], templates[], categories[], data_sources[]
  /assets
    <asset_id>.<ext>  -- image/video files, named by asset id, checksum in manifest.json
```

### 13.3 Import Behavior

- Manifest validated before touching the database.
- Per-conflict prompt: skip, overwrite, or import as a copy.
- Assets matched by checksum; already-present assets reused.
- Full-system import into a populated instance merges by default, not a wipe-and-replace.

### 13.4 Use Cases

Disaster recovery, safe experimentation before a reshuffle, portability between dev/staging and production, sharing a self-contained show.

---

## 14. Open Questions

1. **Custom REST endpoint vs. backend-side joins:** does Brian want to build the small custom `signage/v1` PHP endpoint (§6.4, recommended — cleaner long-term), or should the signage backend do the multi-hop Pods relationship resolution itself (more app-side complexity, zero new WordPress code)?
2. **Author field placement:** does the WooCommerce product title already cleanly separate title/author, or is an `Author` Pods field extension on the `product` post type needed (§6.3)?
3. **WPForms → Pods hand-off:** does Brian's WPForms plan include the Post Submissions add-on, or is the manual path assumed for v1?
4. **Approval mechanism:** dedicated `approved` Pods field for Community Board, or rely on WordPress's Draft → Publish status?
5. **Current-month auto-resolution:** should every Featured Readers block default to "current month," or does Brian want most blocks pinned to a specific period with manual advancing (e.g., to preview/QA next month's lineup before flipping it live)?
6. **Scope of §6.5 content sources for v1:** Staff Picks, Announcements, blog-driven slides — any of these worth pulling into v1?
7. **n8n webhook trigger:** a `functions.php`/must-use-plugin snippet on `save_post`, or the no-code WP Webhooks plugin (§6.8, tip 1)?
8. **Player refresh cadence:** shorten the player's poll interval, rely on the manual "Refresh Now" button, or both (§6.8, tip 6)?
9. **REST access scope:** does WordPress need an authenticated connection for the signage backend to read draft/unapproved content for admin preview, or is public/published-only access sufficient?

---

## 15. Suggested Phasing

**Phase 1 (MVP):**
- Block CRUD (static image, video), categories, scheduling (start/end)
- Single sequence, manual drag-and-drop ordering
- Player: kiosk browser, AirPlay, single display
- Basic admin UI, local-network-only, no auth
- WordPress Events sync (The Events Calendar REST API)
- Show export/import (single sequence scope)

**Phase 2:**
- Community Board Pods content type + WPForms intake pipeline, with start/end date fields
- Featured Readers: `signage_reader`, `signage_recommendation`, `signage_feature_period` taxonomy, and the product relationship (§6.3)
- The custom `signage/v1` REST endpoint, if Brian opts for it (§6.4) — recommended to build alongside Featured Readers rather than retrofit later
- Event, Community Board, and Featured Reader templates; Carousel and List modes
- Multiple sequences + live-sequence switching
- Full-system export/import
- CSV as fallback data source

**Phase 3:**
- n8n webhook-driven real-time sync (§6.8), including debounce, targeted upsert, and error alerting
- Player poll-interval tuning / manual "Refresh Now"
- Any of the §6.5 additional WordPress content sources Brian wants
- Auto-fill/dynamic ordering pools
- Player health dashboard, auto-recovery hardening
- Scheduled sequence auto-switching
- (Stretch) visual template editor, multi-display support

---

*This document reflects Brian's decision to build on Next.js (App Router, TypeScript) + Tailwind CSS as a single app for admin UI, player, and API, paired with a lightweight "worker" service for scheduled polling, and Drizzle ORM in place of Prisma, plus concrete steps (§11.5) for hosting the Dockerized solution on a separate Mac while development continues on this machine. Section 14 has the remaining decision points.*
