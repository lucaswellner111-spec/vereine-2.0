CREATE TABLE "social"."calendar_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "social"."events" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_series_idx" ON "social"."events" USING btree ("series_id");