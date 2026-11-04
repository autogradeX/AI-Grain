ALTER TABLE "samples" ADD COLUMN "enam_lot_id" text;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "gate_entry_no" text;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "farmer_name" text;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "farmer_id" text;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "farmer_mobile" text;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "protein_pct" double precision;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "oil_pct" double precision;--> statement-breakpoint
CREATE INDEX "samples_org_enam_lot_idx" ON "samples" USING btree ("org_id","enam_lot_id");