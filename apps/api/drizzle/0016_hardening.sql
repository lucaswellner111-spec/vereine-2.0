ALTER TABLE "chat"."message_reports" DROP CONSTRAINT "message_reports_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "chat"."message_reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat"."message_reports" ADD COLUMN "sender_id" uuid;--> statement-breakpoint
ALTER TABLE "chat"."message_reports" ADD COLUMN "snapshot_key" text;--> statement-breakpoint
ALTER TABLE "chat"."message_reports" ADD COLUMN "snapshot_key_version" integer;--> statement-breakpoint
ALTER TABLE "chat"."message_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
-- Datenkorrektur (von Hand): Absender bestehender Meldungen sichern, solange die Nachricht noch existiert.
UPDATE chat.message_reports r SET sender_id = m.sender_id FROM chat.messages m WHERE m.id = r.message_id AND r.sender_id IS NULL;--> statement-breakpoint
-- Datenkorrektur (von Hand): doppelte offene Meldungen derselben Person zusammenfassen (aelteste bleibt), sonst scheitert der Unique-Index.
DELETE FROM chat.message_reports a USING chat.message_reports b WHERE a.status = 'open' AND b.status = 'open' AND a.message_id = b.message_id AND a.reporter_id = b.reporter_id AND (a.created_at, a.id) > (b.created_at, b.id);--> statement-breakpoint
DELETE FROM social.reports a USING social.reports b WHERE a.status = 'open' AND b.status = 'open' AND a.post_id = b.post_id AND a.reporter_id = b.reporter_id AND (a.created_at, a.id) > (b.created_at, b.id);--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "social"."comments" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_org_idx" ON "chat"."conversations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "event_rsvps_user_idx" ON "social"."event_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_team_idx" ON "social"."events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "message_reports_message_status_idx" ON "chat"."message_reports" USING btree ("message_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_open_once_uq" ON "chat"."message_reports" USING btree ("message_id","reporter_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "organizations_tags_idx" ON "social"."organizations" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "post_likes_user_created_idx" ON "social"."post_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "post_media_media_idx" ON "social"."post_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "reports_post_status_idx" ON "social"."reports" USING btree ("post_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_once_uq" ON "social"."reports" USING btree ("post_id","reporter_id") WHERE status = 'open';--> statement-breakpoint
-- Datenkorrektur (von Hand): Vereinsadressen, die mit festen Routen kollidieren (RESERVED_ORG_SLUGS).
UPDATE social.organizations SET slug = slug || '-' || substr(id::text, 1, 4) WHERE slug IN ('mine', 'managed', 'neu');--> statement-breakpoint
-- Datenkorrektur (von Hand): reservierte Profil-Handles (RESERVED_HANDLES aus packages/shared).
UPDATE social.profiles SET handle = left(handle, 25) || '_' || substr(replace(user_id::text, '-', ''), 1, 4) WHERE handle IN ('admin', 'api', 'ws', 'me', 'root', 'system', 'support', 'klubnest', 'plattform', 'vereine', 'chat', 'feed', 'kalender');--> statement-breakpoint
-- Datenkorrektur (von Hand, einmalig): Personen, die einen Verein verlassen haben, aus dessen Gruppen-Chats entfernen.
DELETE FROM chat.conversation_members cm USING chat.conversations c WHERE c.id = cm.conversation_id AND c.kind = 'group' AND c.org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM social.org_members om WHERE om.org_id = c.org_id AND om.user_id = cm.user_id AND om.status = 'active');--> statement-breakpoint
UPDATE chat.conversation_members cm SET role = 'owner' FROM (SELECT DISTINCT ON (x.conversation_id) x.conversation_id, x.user_id FROM chat.conversation_members x JOIN chat.conversations c ON c.id = x.conversation_id WHERE c.kind = 'group' AND NOT EXISTS (SELECT 1 FROM chat.conversation_members o WHERE o.conversation_id = x.conversation_id AND o.role = 'owner') ORDER BY x.conversation_id, x.joined_at) heir WHERE cm.conversation_id = heir.conversation_id AND cm.user_id = heir.user_id;--> statement-breakpoint
DELETE FROM chat.conversations c WHERE c.kind = 'group' AND NOT EXISTS (SELECT 1 FROM chat.conversation_members m WHERE m.conversation_id = c.id) AND NOT EXISTS (SELECT 1 FROM chat.message_reports r WHERE r.conversation_id = c.id AND r.status = 'open');
