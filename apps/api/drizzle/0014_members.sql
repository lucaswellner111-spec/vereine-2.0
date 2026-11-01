CREATE SCHEMA "members";
--> statement-breakpoint
CREATE TABLE "members"."fee_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"interval" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_classes_org_name_unique" UNIQUE("org_id","name")
);
--> statement-breakpoint
CREATE TABLE "members"."member_counters" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"."member_profiles" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_no" integer NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"birth_date" date,
	"guardian_name" text DEFAULT '' NOT NULL,
	"guardian_email" text DEFAULT '' NOT NULL,
	"fee_class_id" uuid,
	"joined_on" date NOT NULL,
	"left_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "member_profiles_no_unique" UNIQUE("org_id","member_no")
);
--> statement-breakpoint
ALTER TABLE "members"."member_profiles" ADD CONSTRAINT "member_profiles_fee_class_id_fee_classes_id_fk" FOREIGN KEY ("fee_class_id") REFERENCES "members"."fee_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_classes_org_idx" ON "members"."fee_classes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "member_profiles_user_idx" ON "members"."member_profiles" USING btree ("user_id");