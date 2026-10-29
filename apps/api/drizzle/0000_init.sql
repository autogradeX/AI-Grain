CREATE TYPE "public"."batch_status" AS ENUM('uploaded', 'detecting', 'detected', 'classifying', 'classified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'confirmed', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'grader', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sample_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('verify_email', 'reset_password', 'invite');--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"batch_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid,
	"org_id" uuid,
	"email" text NOT NULL,
	"role" "role",
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"side" text DEFAULT 'front' NOT NULL,
	"status" "batch_status" DEFAULT 'uploaded' NOT NULL,
	"original_key" text NOT NULL,
	"original_width" integer NOT NULL,
	"original_height" integer NOT NULL,
	"board_key" text,
	"corners" jsonb,
	"kernel_count" integer,
	"crop_window_cm" double precision,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kernels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL,
	"area" integer NOT NULL,
	"cell" text NOT NULL,
	"is_cluster" boolean DEFAULT false NOT NULL,
	"crop_key" text NOT NULL,
	"ai_class" text,
	"ai_confidence" text,
	"ai_reason" text,
	"final_class" text,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"crop" text NOT NULL,
	"cls" text NOT NULL,
	"storage_key" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"crop" text NOT NULL,
	"standard_id" uuid,
	"source" text,
	"notes" text,
	"status" "sample_status" DEFAULT 'in_progress' NOT NULL,
	"model" text,
	"sample_mass_g" double precision,
	"moisture_pct" double precision,
	"test_weight_kg_per_hl" double precision,
	"cup_mass_g" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"reference" jsonb,
	"ai_summary" text,
	"created_by" uuid,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"crop" text NOT NULL,
	"description" text,
	"grades" jsonb NOT NULL,
	"definitions" jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kernels" ADD CONSTRAINT "kernels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kernels" ADD CONSTRAINT "kernels_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kernels" ADD CONSTRAINT "kernels_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kernels" ADD CONSTRAINT "kernels_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "kernels_batch_idx" ON "kernels" USING btree ("batch_id","number");--> statement-breakpoint
CREATE INDEX "kernels_sample_idx" ON "kernels" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "samples_org_number_idx" ON "samples" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "samples_org_created_idx" ON "samples" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));