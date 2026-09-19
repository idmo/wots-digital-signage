// Digital Signage — Drizzle schema (SQLite, PRD §10 "Data Model")
// Swap to drizzle-orm/pg-core + a Postgres client for the scale path (PRD §11.4).

import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => new Date().toISOString()),
};

export const categories = sqliteTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  defaultTemplateId: text("default_template_id"),
  defaultDurationSeconds: integer("default_duration_seconds").notNull().default(10),
  color: text("color").notNull().default("#4f46e5"),
  ...timestamps,
});

export const templates = sqliteTable("templates", {
  id: id(),
  name: text("name").notNull(),
  categoryId: text("category_id"),
  // JSON string: [{ name, type: text|image|qr|date }]
  schema: text("schema").notNull(),
  htmlTemplate: text("html_template").notNull(),
  css: text("css").notNull().default(""),
  ...timestamps,
});

export const dataSources = sqliteTable("data_sources", {
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

export const blocks = sqliteTable(
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
      .default(sql`(current_timestamp)`),
    endDate: text("end_date"),
    durationSeconds: integer("duration_seconds"),
    // cover | contain | contain_blurred
    fitMode: text("fit_mode").notNull().default("cover"),
    ...timestamps,
  },
  (table) => [index("blocks_status_idx").on(table.status), index("blocks_category_idx").on(table.categoryId)]
);

export const staticImageBlocks = sqliteTable("static_image_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  imageAssetId: text("image_asset_id")
    .notNull()
    .references(() => assets.id),
  textHeavy: integer("text_heavy", { mode: "boolean" }).notNull().default(false),
});

export const videoBlocks = sqliteTable("video_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  videoAssetId: text("video_asset_id")
    .notNull()
    .references(() => assets.id),
  durationSeconds: integer("duration_seconds").notNull(),
});

export const dynamicBlocks = sqliteTable("dynamic_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  templateId: text("template_id")
    .notNull()
    .references(() => templates.id),
  dataSourceId: text("data_source_id")
    .notNull()
    .references(() => dataSources.id),
  // carousel | list
  displayMode: text("display_mode").notNull().default("carousel"),
  perItemDuration: integer("per_item_duration").notNull().default(10),
  maxItems: integer("max_items").notNull().default(20),
  listLabel: text("list_label"),
  fieldOverrides: text("field_overrides"),
});

export const sequences = sqliteTable("sequences", {
  id: id(),
  name: text("name").notNull(),
  isLive: integer("is_live", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const sequenceBlocks = sqliteTable(
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
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    unique("sequence_blocks_sequence_block_unique").on(table.sequenceId, table.blockId),
    index("sequence_blocks_sequence_position_idx").on(table.sequenceId, table.position),
  ]
);

export const assets = sqliteTable(
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
      .default(sql`(current_timestamp)`),
    cachedAt: text("cached_at"),
  },
  (table) => [index("assets_checksum_idx").on(table.checksum)]
);

export const syncLogs = sqliteTable(
  "sync_logs",
  {
    id: id(),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    runAt: text("run_at")
      .notNull()
      .default(sql`(current_timestamp)`),
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

export const templatesRelations = relations(templates, ({ one, many }) => ({
  category: one(categories, {
    fields: [templates.categoryId],
    references: [categories.id],
  }),
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
}));

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  dataSource: one(dataSources, { fields: [syncLogs.dataSourceId], references: [dataSources.id] }),
}));
