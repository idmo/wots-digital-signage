ALTER TABLE "dynamic_blocks" ADD COLUMN "background_image_asset_id" text;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD COLUMN "div_background_color" text DEFAULT '#000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD COLUMN "div_background_opacity" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "dynamic_blocks" ADD CONSTRAINT "dynamic_blocks_background_image_asset_id_assets_id_fk" FOREIGN KEY ("background_image_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;