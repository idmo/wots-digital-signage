// Digital Signage — Drizzle schema (PostgreSQL, PRD §10 "Data Model")
// Dates are stored as ISO-string `text` columns (not native `timestamp`)
// so the app-level code (which does new Date(x).toISOString() / string
// comparisons throughout) didn't need to change when this moved off SQLite.

import { relations } from "drizzle-orm";
import { pgTable, text, integer, boolean, index, unique } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
};

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  defaultTemplateId: text("default_template_id"),
  defaultDurationSeconds: integer("default_duration_seconds").notNull().default(10),
  color: text("color").notNull().default("#4f46e5"),
  ...timestamps,
});

// A reusable drag-and-drop layout (see lib/templates.ts) for a
// dynamic_template block's built-in WordPress renderer — pick a layout
// (stack | split_left | split_right), then drag content elements (title,
// featured image, a custom field, ...) into its regions. Scoped to one
// data source type, since the elements available depend on which
// WordPress REST endpoint the block pulls from.
export const templates = pgTable("templates", {
  id: id(),
  name: text("name").notNull(),
  // wordpress_events | wordpress_bulletin_board — which content-element set
  // (lib/templates.ts CONTENT_ELEMENTS) this template was built from.
  dataSourceType: text("data_source_type").notNull(),
  // stack | split_left | split_right (lib/templates.ts TEMPLATE_LAYOUTS)
  layout: text("layout").notNull().default("stack"),
  // JSON string: Record<regionId, string[]> — ordered content-element keys
  // placed in each region.
  regions: text("regions").notNull().default("{}"),
  ...timestamps,
});

export const dataSources = pgTable("data_sources", {
  id: id(),
  name: text("name").notNull(),
  // wordpress_events | wordpress_pods | wordpress_custom_rest | csv | manual
  type: text("type").notNull(),
  // JSON string, shape depends on `type` — see PRD §10
  config: text("config").notNull(),
  lastSyncedAt: text("last_synced_at"),
  webhookSecret: text("webhook_secret"),
  ...timestamps,
});

export const blocks = pgTable(
  "blocks",
  {
    id: id(),
    name: text("name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    // static_image | video | dynamic_template
    type: text("type").notNull(),
    // draft | active | expired | archived
    status: text("status").notNull().default("draft"),
    startDate: text("start_date")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    endDate: text("end_date"),
    durationSeconds: integer("duration_seconds"),
    // cover | contain | contain_blurred
    fitMode: text("fit_mode").notNull().default("cover"),
    // Free-text annotation for whoever's managing content (e.g. "swap after Sept 30").
    note: text("note"),
    // Per-block overrides for the two transition/animation settings below —
    // null means "use the global default from `settings`" (see that table).
    // contentAnimation: fade | slide | zoom | none — animates the content
    // *inside* a dynamic block's panel (not its background image) whenever
    // that content first appears or changes. Only meaningful for
    // dynamic_template blocks (the ones with a DynamicPanel); harmless and
    // unused on static_image/video blocks.
    contentAnimation: text("content_animation"),
    // blockTransition: cut | crossfade | slide | zoom — how the *whole
    // screen* transitions from the previous block in the sequence into this
    // one. Applies to every block type.
    blockTransition: text("block_transition"),
    ...timestamps,
  },
  (table) => [index("blocks_status_idx").on(table.status), index("blocks_category_idx").on(table.categoryId)]
);

export const staticImageBlocks = pgTable("static_image_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  imageAssetId: text("image_asset_id")
    .notNull()
    .references(() => assets.id),
  textHeavy: boolean("text_heavy").notNull().default(false),
});

export const videoBlocks = pgTable("video_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  videoAssetId: text("video_asset_id")
    .notNull()
    .references(() => assets.id),
  durationSeconds: integer("duration_seconds").notNull(),
});

export const dynamicBlocks = pgTable("dynamic_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  // Null = rendered by a built-in renderer (e.g. the WordPress Events
  // carousel) rather than a user-authored template. The general
  // template engine (PRD §3.6, arbitrary HTML + variable substitution)
  // is still Phase 2+; this is the pragmatic first slice of §3.4/§6.8.
  templateId: text("template_id").references(() => templates.id),
  dataSourceId: text("data_source_id")
    .notNull()
    .references(() => dataSources.id),
  // carousel | list
  displayMode: text("display_mode").notNull().default("carousel"),
  perItemDuration: integer("per_item_duration").notNull().default(10),
  maxItems: integer("max_items").notNull().default(20),
  listLabel: text("list_label"),
  // Featured Readers only: free-text "Month Year" (e.g. "September 2025")
  // matched — normalized, on the WordPress side — against each Reader's own
  // "Featured Month and Year" field. Null/blank = auto-resolve to whatever
  // month it currently is, same as before this was pinnable per block.
  featuredMonthYear: text("featured_month_year"),
  fieldOverrides: text("field_overrides"),
  // Built-in WordPress renderers (Events, Bulletin Board): a full-bleed
  // background image behind a padded, tinted text panel, plus each item's
  // own WordPress featured image shown as a banner above the text/QR row.
  // Set once per block, shared by every item it cycles through.
  backgroundImageAssetId: text("background_image_asset_id").references(() => assets.id),
  // Hex color for the text panel, e.g. "#000000".
  divBackgroundColor: text("div_background_color").notNull().default("#000000"),
  // 0-100 (%) opacity applied to divBackgroundColor.
  divBackgroundOpacity: integer("div_background_opacity").notNull().default(60),
  // Per-element text hex colors within the panel. metaColor is only used by
  // the Events renderer's weekday/date/time line — harmless default for
  // Bulletin Board, which has no on-screen date line.
  titleColor: text("title_color").notNull().default("#ffffff"),
  bodyColor: text("body_color").notNull().default("#ffffff"),
  metaColor: text("meta_color").notNull().default("#ffffff"),
});

// A single-row table (id is always the literal "global") holding the
// app-wide defaults for the two transition/animation settings a block can
// individually override (see `blocks.contentAnimation`/`blockTransition`
// above). Kept as its own table rather than folded into an existing one
// since it's app-wide config, not owned by any one block/category/sequence.
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  // none | fade | slide | zoom — default entrance animation for a dynamic
  // block's inner content panel.
  contentAnimation: text("content_animation").notNull().default("fade"),
  contentAnimationDurationMs: integer("content_animation_duration_ms").notNull().default(500),
  // cut | crossfade | slide | zoom — default transition between blocks.
  blockTransition: text("block_transition").notNull().default("crossfade"),
  blockTransitionDurationMs: integer("block_transition_duration_ms").notNull().default(800),
  ...timestamps,
});

export const sequences = pgTable("sequences", {
  id: id(),
  name: text("name").notNull(),
  isLive: boolean("is_live").notNull().default(false),
  ...timestamps,
});

export const sequenceBlocks = pgTable(
  "sequence_blocks",
  {
    id: id(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    pinned: boolean("pinned").notNull().default(true),
  },
  (table) => [
    unique("sequence_blocks_sequence_block_unique").on(table.sequenceId, table.blockId),
    index("sequence_blocks_sequence_position_idx").on(table.sequenceId, table.position),
  ]
);

export const assets = pgTable(
  "assets",
  {
  id: id(),
  // image | video
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: integer("duration_seconds"),
  fileSize: integer("file_size"),
  checksum: text("checksum"),
  // upload | wordpress_media | woocommerce_product
  source: text("source").notNull().default("upload"),
  wpAttachmentId: text("wp_attachment_id"),
  sourceProductId: text("source_product_id"),
    uploadedAt: text("uploaded_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    cachedAt: text("cached_at"),
  },
  (table) => [index("assets_checksum_idx").on(table.checksum)]
);

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: id(),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    runAt: text("run_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    // success | error
    status: text("status").notNull(),
    itemsFetched: integer("items_fetched").notNull().default(0),
    errorMessage: text("error_message"),
    // poll | webhook | manual
    trigger: text("trigger").notNull().default("poll"),
  },
  (table) => [index("sync_logs_source_run_idx").on(table.dataSourceId, table.runAt)]
);

// ---- Relations ----

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  defaultTemplate: one(templates, {
    fields: [categories.defaultTemplateId],
    references: [templates.id],
  }),
  blocks: many(blocks),
}));

export const templatesRelations = relations(templates, ({ many }) => ({
  dynamicBlocks: many(dynamicBlocks),
}));

export const dataSourcesRelations = relations(dataSources, ({ many }) => ({
  dynamicBlocks: many(dynamicBlocks),
  syncLogs: many(syncLogs),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  category: one(categories, {
    fields: [blocks.categoryId],
    references: [categories.id],
  }),
  staticImage: one(staticImageBlocks, {
    fields: [blocks.id],
    references: [staticImageBlocks.blockId],
  }),
  video: one(videoBlocks, {
    fields: [blocks.id],
    references: [videoBlocks.blockId],
  }),
  dynamic: one(dynamicBlocks, {
    fields: [blocks.id],
    references: [dynamicBlocks.blockId],
  }),
  sequenceLinks: many(sequenceBlocks),
}));

export const staticImageBlocksRelations = relations(staticImageBlocks, ({ one }) => ({
  block: one(blocks, { fields: [staticImageBlocks.blockId], references: [blocks.id] }),
  imageAsset: one(assets, { fields: [staticImageBlocks.imageAssetId], references: [assets.id] }),
}));

export const videoBlocksRelations = relations(videoBlocks, ({ one }) => ({
  block: one(blocks, { fields: [videoBlocks.blockId], references: [blocks.id] }),
  videoAsset: one(assets, { fields: [videoBlocks.videoAssetId], references: [assets.id] }),
}));

export const dynamicBlocksRelations = relations(dynamicBlocks, ({ one }) => ({
  block: one(blocks, { fields: [dynamicBlocks.blockId], references: [blocks.id] }),
  template: one(templates, { fields: [dynamicBlocks.templateId], references: [templates.id] }),
  dataSource: one(dataSources, { fields: [dynamicBlocks.dataSourceId], references: [dataSources.id] }),
  backgroundImage: one(assets, { fields: [dynamicBlocks.backgroundImageAssetId], references: [assets.id] }),
}));

export const sequencesRelations = relations(sequences, ({ many }) => ({
  blocks: many(sequenceBlocks),
}));

export const sequenceBlocksRelations = relations(sequenceBlocks, ({ one }) => ({
  sequence: one(sequences, { fields: [sequenceBlocks.sequenceId], references: [sequences.id] }),
  block: one(blocks, { fields: [sequenceBlocks.blockId], references: [blocks.id] }),
}));

export const assetsRelations = relations(assets, ({ many }) => ({
  staticImageBlocks: many(staticImageBlocks),
  videoBlocks: many(videoBlocks),
  dynamicBlockBackgrounds: many(dynamicBlocks),
}));

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  dataSource: one(dataSources, { fields: [syncLogs.dataSourceId], references: [dataSources.id] }),
}));
