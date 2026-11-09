ALTER TABLE "batches" ADD COLUMN "pair_of" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "pair_match" jsonb;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "twin_of" uuid;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "other_side_class" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "other_side_confidence" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "other_side_reason" text;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_pair_of_batches_id_fk" FOREIGN KEY ("pair_of") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kernels" ADD CONSTRAINT "kernels_twin_of_kernels_id_fk" FOREIGN KEY ("twin_of") REFERENCES "public"."kernels"("id") ON DELETE set null ON UPDATE no action;