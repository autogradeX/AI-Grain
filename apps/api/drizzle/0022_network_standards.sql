CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"name" text NOT NULL,
	"health" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standards" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "standards" ADD COLUMN "network_id" uuid;--> statement-breakpoint
ALTER TABLE "standards" ADD COLUMN "network_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stations_key_idx" ON "stations" USING btree ("key_id");