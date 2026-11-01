ALTER TABLE "batches" ADD COLUMN "side_detected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "expert_class" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "expert_confidence" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "expert_reason" text;