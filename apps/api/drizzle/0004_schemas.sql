-- Tabellen in Bereichs-Schemas verschieben (keine Datenkopie: Daten, Indizes und Fremdschluessel bleiben erhalten).
CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "social";
--> statement-breakpoint
ALTER TABLE "public"."users" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "public"."sessions" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "public"."consents" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "public"."audit_log" SET SCHEMA "identity";
--> statement-breakpoint
ALTER TABLE "public"."organizations" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."org_members" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."follows" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."posts" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."post_likes" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."comments" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."reports" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."notifications" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."teams" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."team_members" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."events" SET SCHEMA "social";
--> statement-breakpoint
ALTER TABLE "public"."event_rsvps" SET SCHEMA "social";
