CREATE TABLE "members"."pending_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"member_no" integer,
	"joined_on" date,
	"fee_class_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"invite_id" uuid,
	"sent_at" timestamp with time zone,
	"invite_expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_members_email_unique" UNIQUE("org_id","email"),
	CONSTRAINT "pending_members_no_unique" UNIQUE("org_id","member_no")
);
--> statement-breakpoint
ALTER TABLE "social"."org_invites" ADD COLUMN "purpose" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "members"."pending_members" ADD CONSTRAINT "pending_members_fee_class_id_fee_classes_id_fk" FOREIGN KEY ("fee_class_id") REFERENCES "members"."fee_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_members_status_idx" ON "members"."pending_members" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "pending_members_invite_idx" ON "members"."pending_members" USING btree ("invite_id");