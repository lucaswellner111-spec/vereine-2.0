CREATE SCHEMA "mail";
--> statement-breakpoint
CREATE TABLE "identity"."auth_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"new_email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail"."suppressions" (
	"address_hash" text NOT NULL,
	"scope" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_address_hash_scope_pk" PRIMARY KEY("address_hash","scope")
);
--> statement-breakpoint
CREATE TABLE "social"."notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_digest" boolean DEFAULT false NOT NULL,
	"digest_since" timestamp with time zone,
	"last_digest_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "pending_verification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_purpose_idx" ON "identity"."auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_idx" ON "identity"."auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mail_suppressions_created_idx" ON "mail"."suppressions" USING btree ("created_at");