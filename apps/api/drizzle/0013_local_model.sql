CREATE TABLE "local_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"crop" text NOT NULL,
	"version" integer NOT NULL,
	"weights" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "ai_source" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "features" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "local_model" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "local_models" ADD CONSTRAINT "local_models_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_models" ADD CONSTRAINT "local_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_models_org_crop_idx" ON "local_models" USING btree ("org_id","crop","version");