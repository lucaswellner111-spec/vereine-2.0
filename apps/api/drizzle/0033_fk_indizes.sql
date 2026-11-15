CREATE INDEX "event_attendance_marked_by_idx" ON "social"."event_attendance" USING btree ("marked_by");--> statement-breakpoint
CREATE INDEX "events_created_by_idx" ON "social"."events" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "invoices_subject_idx" ON "billing"."invoices" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "member_profiles_fee_class_idx" ON "members"."member_profiles" USING btree ("fee_class_id");--> statement-breakpoint
CREATE INDEX "reports_comment_idx" ON "social"."reports" USING btree ("comment_id");