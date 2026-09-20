CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"content_animation" text DEFAULT 'fade' NOT NULL,
	"content_animation_duration_ms" integer DEFAULT 500 NOT NULL,
	"block_transition" text DEFAULT 'crossfade' NOT NULL,
	"block_transition_duration_ms" integer DEFAULT 800 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "content_animation" text;
--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "block_transition" text;
--> statement-breakpoint
INSERT INTO "settings" ("id", "content_animation", "content_animation_duration_ms", "block_transition", "block_transition_duration_ms", "created_at", "updated_at")
VALUES ('global', 'fade', 500, 'crossfade', 800, now()::text, now()::text)
ON CONFLICT ("id") DO NOTHING;
