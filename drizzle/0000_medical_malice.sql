CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_seconds` integer,
	`file_size` integer,
	`checksum` text,
	`source` text DEFAULT 'upload' NOT NULL,
	`wp_attachment_id` text,
	`source_product_id` text,
	`uploaded_at` text DEFAULT (current_timestamp) NOT NULL,
	`cached_at` text
);
--> statement-breakpoint
CREATE INDEX `assets_checksum_idx` ON `assets` (`checksum`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`start_date` text DEFAULT (current_timestamp) NOT NULL,
	`end_date` text,
	`duration_seconds` integer,
	`fit_mode` text DEFAULT 'cover' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocks_status_idx` ON `blocks` (`status`);--> statement-breakpoint
CREATE INDEX `blocks_category_idx` ON `blocks` (`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_template_id` text,
	`default_duration_seconds` integer DEFAULT 10 NOT NULL,
	`color` text DEFAULT '#4f46e5' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`last_synced_at` text,
	`webhook_secret` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dynamic_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`display_mode` text DEFAULT 'carousel' NOT NULL,
	`per_item_duration` integer DEFAULT 10 NOT NULL,
	`max_items` integer DEFAULT 20 NOT NULL,
	`list_label` text,
	`field_overrides` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sequence_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence_id` text NOT NULL,
	`block_id` text NOT NULL,
	`position` integer NOT NULL,
	`pinned` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sequence_blocks_sequence_position_idx` ON `sequence_blocks` (`sequence_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `sequence_blocks_sequence_block_unique` ON `sequence_blocks` (`sequence_id`,`block_id`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `static_image_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`image_asset_id` text NOT NULL,
	`text_heavy` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`data_source_id` text NOT NULL,
	`run_at` text DEFAULT (current_timestamp) NOT NULL,
	`status` text NOT NULL,
	`items_fetched` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`trigger` text DEFAULT 'poll' NOT NULL,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_logs_source_run_idx` ON `sync_logs` (`data_source_id`,`run_at`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` text,
	`schema` text NOT NULL,
	`html_template` text NOT NULL,
	`css` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `video_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`video_asset_id` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
