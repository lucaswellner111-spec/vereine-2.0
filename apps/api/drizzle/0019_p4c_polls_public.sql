CREATE TABLE "social"."poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "poll_options_post_position_uq" UNIQUE("post_id","position"),
	CONSTRAINT "poll_options_id_post_uq" UNIQUE("id","post_id"),
	CONSTRAINT "poll_options_label_chk" CHECK (char_length(label) BETWEEN 1 AND 80),
	CONSTRAINT "poll_options_votes_chk" CHECK (votes >= 0)
);
--> statement-breakpoint
CREATE TABLE "social"."poll_votes" (
	"post_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "social"."polls" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polls_question_chk" CHECK (char_length(question) BETWEEN 3 AND 200)
);
--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "public_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."poll_options" ADD CONSTRAINT "poll_options_post_id_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "social"."polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."poll_votes" ADD CONSTRAINT "poll_votes_post_id_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "social"."polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."poll_votes" ADD CONSTRAINT "poll_votes_option_fk" FOREIGN KEY ("option_id","post_id") REFERENCES "social"."poll_options"("id","post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."polls" ADD CONSTRAINT "polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "social"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_votes_user_idx" ON "social"."poll_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "poll_votes_option_idx" ON "social"."poll_votes" USING btree ("option_id");--> statement-breakpoint
-- Von Hand: Trigger haelt poll_options.votes aktuell (Stimme abgeben, aendern, zuruecknehmen, Kaskade bei Kontoloeschung).
-- Zeilensperre auf der Option serialisiert parallele Stimmen; CHECK poll_options_votes_chk verhindert negative Zaehler.
CREATE OR REPLACE FUNCTION "social"."poll_votes_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.option_id = NEW.option_id THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "social"."poll_options" SET votes = votes - 1 WHERE id = OLD.option_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE "social"."poll_options" SET votes = votes + 1 WHERE id = NEW.option_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "poll_votes_count" AFTER INSERT OR UPDATE OR DELETE ON "social"."poll_votes" FOR EACH ROW EXECUTE FUNCTION "social"."poll_votes_count"();
