-- Einwilligungen (identity.consents) sind append-only: Aenderungen gibt es nur als neue Zeile.
-- Kein UPDATE, kein TRUNCATE. DELETE nur als Folge der Kontoloeschung (FK ON DELETE CASCADE: das Konto ist dann schon weg).
CREATE FUNCTION "identity"."consents_append_only"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "identity"."users" WHERE id = OLD.user_id) THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'identity.consents ist append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "consents_no_update" BEFORE UPDATE ON "identity"."consents" FOR EACH ROW EXECUTE FUNCTION "identity"."consents_append_only"();
--> statement-breakpoint
CREATE TRIGGER "consents_no_delete" BEFORE DELETE ON "identity"."consents" FOR EACH ROW EXECUTE FUNCTION "identity"."consents_append_only"();
--> statement-breakpoint
CREATE TRIGGER "consents_no_truncate" BEFORE TRUNCATE ON "identity"."consents" FOR EACH STATEMENT EXECUTE FUNCTION "identity"."consents_append_only"();
