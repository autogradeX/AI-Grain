ALTER TABLE "batches" ADD COLUMN "grain_count" integer;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "mm_per_px" double precision;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "measurement" jsonb DEFAULT '{}'::jsonb NOT NULL;