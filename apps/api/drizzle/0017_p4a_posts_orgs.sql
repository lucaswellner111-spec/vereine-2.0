DROP INDEX "social"."reports_open_once_uq";--> statement-breakpoint
ALTER TABLE "social"."media" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."media" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "banner_media_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social"."reports" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."media" ADD CONSTRAINT "media_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "social"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD CONSTRAINT "organizations_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "social"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD CONSTRAINT "organizations_banner_media_id_media_id_fk" FOREIGN KEY ("banner_media_id") REFERENCES "social"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "social"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_org_idx" ON "social"."media" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_comment_open_once_uq" ON "social"."reports" USING btree ("comment_id","reporter_id") WHERE status = 'open' AND comment_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_once_uq" ON "social"."reports" USING btree ("post_id","reporter_id") WHERE status = 'open' AND comment_id IS NULL;--> statement-breakpoint
ALTER TABLE "social"."media" ADD CONSTRAINT "media_owner_or_org_chk" CHECK (owner_id IS NOT NULL OR org_id IS NOT NULL);