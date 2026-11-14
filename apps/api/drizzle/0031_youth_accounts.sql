CREATE TABLE "identity"."guardian_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youth_user_id" uuid NOT NULL,
	"guardian_user_id" uuid,
	"purpose" text NOT NULL,
	"org_id" uuid,
	"granted" boolean NOT NULL,
	"text_version" text NOT NULL,
	"text_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retain_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identity"."guardianships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"youth_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_billing_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "guardianships_pair_unique" UNIQUE("guardian_user_id","youth_user_id"),
	CONSTRAINT "guardianships_status_chk" CHECK (status IN ('active', 'ended')),
	CONSTRAINT "guardianships_not_self_chk" CHECK (guardian_user_id <> youth_user_id)
);
--> statement-breakpoint
CREATE TABLE "identity"."youth_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"graduation_due_on" date NOT NULL,
	"graduation_started_at" timestamp with time zone,
	"notified_30_at" timestamp with time zone,
	"notified_7_at" timestamp with time zone,
	"orphaned_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."invoices" DROP CONSTRAINT "invoices_fee_run_recipient_unique";--> statement-breakpoint
ALTER TABLE "billing"."fee_runs" ADD COLUMN "skipped_no_recipient" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "subject_user_id" uuid;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "subject_name" text;--> statement-breakpoint
ALTER TABLE "identity"."users" ADD COLUMN "account_type" text DEFAULT 'adult' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."guardianships" ADD CONSTRAINT "guardianships_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."guardianships" ADD CONSTRAINT "guardianships_youth_user_id_users_id_fk" FOREIGN KEY ("youth_user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."youth_profiles" ADD CONSTRAINT "youth_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_consents_youth_idx" ON "identity"."guardian_consents" USING btree ("youth_user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "guardian_consents_guardian_idx" ON "identity"."guardian_consents" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardianships_one_billing_uq" ON "identity"."guardianships" USING btree ("youth_user_id") WHERE status = 'active' AND is_billing_contact;--> statement-breakpoint
CREATE INDEX "guardianships_youth_idx" ON "identity"."guardianships" USING btree ("youth_user_id");--> statement-breakpoint
CREATE INDEX "youth_profiles_graduation_idx" ON "identity"."youth_profiles" USING btree ("graduation_due_on");--> statement-breakpoint
CREATE INDEX "youth_profiles_orphaned_idx" ON "identity"."youth_profiles" USING btree ("orphaned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_fee_run_recipient_uq" ON "billing"."invoices" USING btree ("fee_run_id","recipient_user_id",coalesce("subject_user_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "users_account_type_idx" ON "identity"."users" USING btree ("account_type");--> statement-breakpoint
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_account_type_chk" CHECK (account_type IN ('adult', 'youth'));
--> statement-breakpoint
-- Nachweis der Elternfreigaben: append-only (Muster avv.acceptances). Erlaubte Aenderungen: guardian_user_id auf NULL
-- (Kontoloeschung des Elternteils) und retain_until einmalig setzen (Loeschung des Kindes). Alles andere bleibt unveraenderlich.
CREATE FUNCTION "identity"."guardian_consents_guard"() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.youth_user_id IS DISTINCT FROM OLD.youth_user_id OR NEW.purpose IS DISTINCT FROM OLD.purpose
		OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.granted IS DISTINCT FROM OLD.granted OR NEW.text_version IS DISTINCT FROM OLD.text_version
		OR NEW.text_hash IS DISTINCT FROM OLD.text_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR (NEW.guardian_user_id IS NOT NULL AND NEW.guardian_user_id IS DISTINCT FROM OLD.guardian_user_id)
		OR (OLD.retain_until IS NOT NULL AND NEW.retain_until IS DISTINCT FROM OLD.retain_until) THEN
		RAISE EXCEPTION 'identity.guardian_consents ist append-only';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "guardian_consents_guard" BEFORE UPDATE ON "identity"."guardian_consents" FOR EACH ROW EXECUTE FUNCTION "identity"."guardian_consents_guard"();
--> statement-breakpoint
-- Loeschen nur durch den Aufbewahrungsjob (setzt vereine.consent_purge=on in seiner Transaktion) und nur abgelaufene Zeilen; TRUNCATE nie.
CREATE FUNCTION "identity"."guardian_consents_no_delete"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND current_setting('vereine.consent_purge', true) = 'on' AND OLD.retain_until IS NOT NULL AND OLD.retain_until < now() THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'identity.guardian_consents ist append-only (kein Loeschen)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "guardian_consents_no_delete" BEFORE DELETE ON "identity"."guardian_consents" FOR EACH ROW EXECUTE FUNCTION "identity"."guardian_consents_no_delete"();
--> statement-breakpoint
CREATE TRIGGER "guardian_consents_no_truncate" BEFORE TRUNCATE ON "identity"."guardian_consents" FOR EACH STATEMENT EXECUTE FUNCTION "identity"."guardian_consents_no_delete"();
