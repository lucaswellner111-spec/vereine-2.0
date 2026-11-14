CREATE SCHEMA "avv";
--> statement-breakpoint
CREATE TABLE "avv"."acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"version" text NOT NULL,
	"text_hash" text NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avv_acceptances_org_version_unique" UNIQUE("org_id","version")
);
--> statement-breakpoint
CREATE INDEX "avv_acceptances_by_idx" ON "avv"."acceptances" USING btree ("accepted_by");
--> statement-breakpoint
-- Append-only: Aenderungen nur an accepted_by (auf NULL bei Kontoloeschung); alles andere bleibt unveraenderlich.
CREATE FUNCTION "avv"."acceptances_guard"() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.version IS DISTINCT FROM OLD.version
		OR NEW.text_hash IS DISTINCT FROM OLD.text_hash OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
		OR (NEW.accepted_by IS NOT NULL AND NEW.accepted_by IS DISTINCT FROM OLD.accepted_by) THEN
		RAISE EXCEPTION 'avv.acceptances ist append-only';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "acceptances_guard" BEFORE UPDATE ON "avv"."acceptances" FOR EACH ROW EXECUTE FUNCTION "avv"."acceptances_guard"();
--> statement-breakpoint
-- Kein Loeschen: weder zeilenweise noch per TRUNCATE. Ein kuenftiges purgeExpired muss den Trigger bewusst umgehen (siehe docs/welle1/W1c-DOKU.md).
CREATE FUNCTION "avv"."acceptances_no_delete"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'avv.acceptances ist append-only (kein Loeschen)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "acceptances_no_delete" BEFORE DELETE ON "avv"."acceptances" FOR EACH ROW EXECUTE FUNCTION "avv"."acceptances_no_delete"();
--> statement-breakpoint
CREATE TRIGGER "acceptances_no_truncate" BEFORE TRUNCATE ON "avv"."acceptances" FOR EACH STATEMENT EXECUTE FUNCTION "avv"."acceptances_no_delete"();