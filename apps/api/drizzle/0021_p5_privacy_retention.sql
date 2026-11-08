ALTER TABLE "social"."org_invites" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."notifications" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "identity"."audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "identity"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_attendance_marked_idx" ON "social"."event_attendance" USING btree ("marked_at");--> statement-breakpoint
CREATE INDEX "notifications_actor_idx" ON "social"."notifications" USING btree ("actor_id") WHERE actor_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "social"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_deleted_idx" ON "social"."posts" USING btree ("deleted_at") WHERE deleted_at IS NOT NULL;