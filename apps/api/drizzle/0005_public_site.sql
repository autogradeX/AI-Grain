CREATE TYPE "public"."article_kind" AS ENUM('guide', 'glossary', 'news', 'case_study');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"kind" "article_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"phone" text,
	"message" text NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "site" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "public_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "demo_title" text;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_org_slug_idx" ON "articles" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "leads_org_idx" ON "leads" USING btree ("org_id","created_at");