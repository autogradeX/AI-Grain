CREATE TABLE "network_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"station" text NOT NULL,
	"ref" text NOT NULL,
	"crop" text NOT NULL,
	"label" text NOT NULL,
	"weight" double precision NOT NULL,
	"batch_ref" text NOT NULL,
	"rel" jsonb NOT NULL,
	"image_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_models" ADD COLUMN "origin" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "network_examples" ADD CONSTRAINT "network_examples_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_examples" ADD CONSTRAINT "network_examples_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "network_examples_ref_idx" ON "network_examples" USING btree ("org_id","key_id","ref");--> statement-breakpoint
CREATE INDEX "network_examples_crop_idx" ON "network_examples" USING btree ("org_id","crop");