CREATE SCHEMA "waitlist";
--> statement-breakpoint
CREATE TABLE "waitlist"."entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"org_name" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"org_type" text DEFAULT '' NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_entries_token_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist"."entries" USING btree ("status","requested_at");