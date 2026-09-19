CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"file_size" integer,
	"checksum" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"wp_attachment_id" text,
	"source_product_id" text,
	"uploaded_at" text NOT NULL,
	"cached_at" text
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"duration_seconds" integer,
	"fit_mode" text DEFAULT 'cover' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_template_id" text,
	"default_duration_seconds" integer DEFAULT 10 NOT NULL,
	"color" text DEFAULT '#4f46e5' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" text NOT NULL,
	"last_synced_at" text,
	"webhook_secret" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dynamic_blocks" (
	"block_id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"data_source_id" text NOT NULL,
	"display_mode" text DEFAULT 'carousel' NOT NULL,
	"per_item_duration" integer DEFAULT 10 NOT NULL,
	"max_items" integer DEFAULT 20 NOT NULL,
	"list_label" text,
	"field_overrides" text
);
--> statement-breakpoint
CREATE TABLE "sequence_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"block_id" text NOT NULL,
	"position" integer NOT NULL,
	"pinned" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sequence_blocks_sequence_block_unique" UNIQUE("sequence_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "static_image_blocks" (
	"block_id" text PRIMARY KEY NOT NULL,
	"image_asset_id" text NOT NULL,
	"text_heavy" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"data_source_id" text NOT NULL,
	"run_at" text NOT NULL,
	"status" text NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"trigger" text DEFAULT 'poll' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" text,
	"schema" text NOT NULL,
	"html_template" text NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_blocks" (
	"block_id" text PRIMARY KEY NOT NULL,
	"video_asset_id" text NOT NULL,
	"duration_seconds" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD CONSTRAINT "dynamic_blocks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD CONSTRAINT "dynamic_blocks_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD CONSTRAINT "dynamic_blocks_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_blocks" ADD CONSTRAINT "sequence_blocks_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_blocks" ADD CONSTRAINT "sequence_blocks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "static_image_blocks" ADD CONSTRAINT "static_image_blocks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "static_image_blocks" ADD CONSTRAINT "static_image_blocks_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_blocks" ADD CONSTRAINT "video_blocks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_blocks" ADD CONSTRAINT "video_blocks_video_asset_id_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_checksum_idx" ON "assets" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "blocks_status_idx" ON "blocks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blocks_category_idx" ON "blocks" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "sequence_blocks_sequence_position_idx" ON "sequence_blocks" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE INDEX "sync_logs_source_run_idx" ON "sync_logs" USING btree ("data_source_id","run_at");