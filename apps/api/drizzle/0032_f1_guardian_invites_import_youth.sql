CREATE TABLE "identity"."guardian_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youth_user_id" uuid NOT NULL,
	"inviter_user_id" uuid,
	"token_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "guardian_invites_status_chk" CHECK (status IN ('open', 'accepted', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "members"."pending_members" DROP CONSTRAINT "pending_members_email_unique";--> statement-breakpoint
ALTER TABLE "members"."pending_members" ADD COLUMN "is_minor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members"."pending_members" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "identity"."youth_profiles" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity"."youth_profiles" ADD COLUMN "deletion_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "identity"."guardian_invites" ADD CONSTRAINT "guardian_invites_youth_user_id_users_id_fk" FOREIGN KEY ("youth_user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."guardian_invites" ADD CONSTRAINT "guardian_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."guardian_invites" ADD CONSTRAINT "guardian_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_invites_youth_idx" ON "identity"."guardian_invites" USING btree ("youth_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_members_email_adult_uq" ON "members"."pending_members" USING btree ("org_id","email") WHERE NOT is_minor;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_members_email_minor_uq" ON "members"."pending_members" USING btree ("org_id","email",lower(first_name),lower(last_name),"birth_date") WHERE is_minor;--> statement-breakpoint
ALTER TABLE "members"."pending_members" ADD CONSTRAINT "pending_members_minor_chk" CHECK (NOT is_minor OR birth_date IS NOT NULL);