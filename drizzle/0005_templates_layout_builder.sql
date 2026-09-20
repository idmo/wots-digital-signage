ALTER TABLE "templates" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "schema";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "html_template";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "css";--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "data_source_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "layout" text DEFAULT 'stack' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "regions" text DEFAULT '{}' NOT NULL;
