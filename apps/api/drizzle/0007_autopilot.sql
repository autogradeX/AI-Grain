ALTER TABLE "kernels" ADD COLUMN "ai_class2" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "ai_confidence2" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "autopilot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "auto_finish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Kernels classified before triage existed keep the review flag of the old
-- rule: touching kernels, anything not sound, and low confidence.
UPDATE "kernels" SET "flag_reason" = CASE
  WHEN "is_cluster" THEN 'cluster'
  WHEN "ai_class" = 'unclear' THEN 'unclear'
  WHEN "ai_class" IS NOT NULL AND "ai_class" <> 'sound' THEN 'defect'
  WHEN "ai_confidence" = 'low' THEN 'low_confidence'
END
WHERE "flag_reason" IS NULL
  AND ("is_cluster" OR ("ai_class" IS NOT NULL AND "ai_class" <> 'sound') OR "ai_confidence" = 'low');
