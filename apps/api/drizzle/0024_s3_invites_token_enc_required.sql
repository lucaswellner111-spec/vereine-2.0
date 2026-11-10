-- Alte Einladungen (vor 0022) ohne verschluesselten Token lassen sich nicht erneut anzeigen: entfernen (keine FKs auf diese Tabelle).
DELETE FROM "social"."org_invites" WHERE "token_enc" IS NULL;--> statement-breakpoint
ALTER TABLE "social"."org_invites" ALTER COLUMN "token_enc" SET NOT NULL;
