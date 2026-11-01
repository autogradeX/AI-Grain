CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "client_ref" text;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "length_mm" double precision;--> statement-breakpoint
ALTER TABLE "kernels" ADD COLUMN "width_mm" double precision;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "report" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "integration" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "dimensions" jsonb;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "repeat_of" uuid;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "client_ref" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_repeat_of_samples_id_fk" FOREIGN KEY ("repeat_of") REFERENCES "public"."samples"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "samples_org_client_ref_idx" ON "samples" USING btree ("org_id","client_ref");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_client_ref_unique" UNIQUE("client_ref");