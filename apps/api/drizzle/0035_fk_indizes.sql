CREATE INDEX "guardian_invites_inviter_idx" ON "identity"."guardian_invites" USING btree ("inviter_user_id");--> statement-breakpoint
CREATE INDEX "guardian_invites_accepted_by_idx" ON "identity"."guardian_invites" USING btree ("accepted_by");--> statement-breakpoint
CREATE INDEX "organizations_logo_media_idx" ON "social"."organizations" USING btree ("logo_media_id") WHERE logo_media_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "organizations_banner_media_idx" ON "social"."organizations" USING btree ("banner_media_id") WHERE banner_media_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pending_members_fee_class_idx" ON "members"."pending_members" USING btree ("fee_class_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "social"."reports" USING btree ("reporter_id");