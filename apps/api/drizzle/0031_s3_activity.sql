CREATE TABLE "social"."comment_likes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "social"."comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "social"."notifications" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "social"."notifications" ADD COLUMN "actor_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."notifications" ADD COLUMN "actor_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "social"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_likes_user_created_idx" ON "social"."comment_likes" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "social"."comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "social"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "social"."comments" USING btree ("parent_id") WHERE parent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_group_uq" ON "social"."notifications" USING btree ("user_id","group_key") WHERE group_key IS NOT NULL;