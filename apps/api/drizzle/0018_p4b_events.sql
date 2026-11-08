CREATE TABLE "social"."event_attendance" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"marked_by" uuid,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_attendance_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "event_attendance_status_chk" CHECK (status IN ('present', 'absent', 'excused'))
);
--> statement-breakpoint
CREATE TABLE "social"."event_shift_signups" (
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_shift_signups_shift_id_user_id_pk" PRIMARY KEY("shift_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "social"."event_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"slots" integer NOT NULL,
	"taken" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_shifts_title_chk" CHECK (char_length(title) BETWEEN 2 AND 80),
	CONSTRAINT "event_shifts_slots_chk" CHECK (slots BETWEEN 1 AND 100),
	CONSTRAINT "event_shifts_taken_chk" CHECK (taken >= 0 AND taken <= slots)
);
--> statement-breakpoint
ALTER TABLE "social"."event_rsvps" ADD COLUMN "waitlisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social"."events" ADD COLUMN "kind" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."events" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "social"."events" ADD COLUMN "yes_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."event_attendance" ADD CONSTRAINT "event_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "social"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."event_attendance" ADD CONSTRAINT "event_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."event_attendance" ADD CONSTRAINT "event_attendance_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."event_shift_signups" ADD CONSTRAINT "event_shift_signups_shift_id_event_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "social"."event_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."event_shift_signups" ADD CONSTRAINT "event_shift_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."event_shifts" ADD CONSTRAINT "event_shifts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "social"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_attendance_user_idx" ON "social"."event_attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_shift_signups_user_idx" ON "social"."event_shift_signups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_shifts_event_position_idx" ON "social"."event_shifts" USING btree ("event_id","position");--> statement-breakpoint
CREATE INDEX "event_rsvps_waitlist_idx" ON "social"."event_rsvps" USING btree ("event_id","status","waitlisted_at");--> statement-breakpoint
ALTER TABLE "social"."events" ADD CONSTRAINT "events_kind_chk" CHECK (kind IN ('training', 'match', 'meeting', 'party', 'other'));--> statement-breakpoint
ALTER TABLE "social"."events" ADD CONSTRAINT "events_capacity_chk" CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 10000);--> statement-breakpoint
ALTER TABLE "social"."events" ADD CONSTRAINT "events_yes_count_chk" CHECK (yes_count >= 0 AND (capacity IS NULL OR yes_count <= capacity));--> statement-breakpoint
-- Von Hand: Zusagen-Zaehler fuer bestehende Termine nachtragen (capacity ist ueberall leer, der CHECK greift nicht).
UPDATE "social"."events" e SET "yes_count" = (SELECT count(*)::int FROM "social"."event_rsvps" r WHERE r.event_id = e.id AND r.status = 'yes');--> statement-breakpoint
-- Von Hand: Trigger haelt events.yes_count aktuell (auch bei Kaskaden wie Kontoloeschung). Ein voller Termin
-- scheitert am CHECK events_yes_count_chk (23514); die API faengt das im Savepoint ab und setzt auf die Warteliste.
CREATE OR REPLACE FUNCTION "social"."event_rsvps_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_id = NEW.event_id AND OLD.status = NEW.status THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'yes' THEN
    UPDATE "social"."events" SET yes_count = yes_count - 1 WHERE id = OLD.event_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'yes' THEN
    UPDATE "social"."events" SET yes_count = yes_count + 1 WHERE id = NEW.event_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "event_rsvps_count" AFTER INSERT OR UPDATE OR DELETE ON "social"."event_rsvps" FOR EACH ROW EXECUTE FUNCTION "social"."event_rsvps_count"();--> statement-breakpoint
-- Von Hand: Trigger haelt event_shifts.taken aktuell; ein voller Dienst scheitert am CHECK event_shifts_taken_chk (23514).
CREATE OR REPLACE FUNCTION "social"."event_shift_signups_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "social"."event_shifts" SET taken = taken - 1 WHERE id = OLD.shift_id;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE "social"."event_shifts" SET taken = taken + 1 WHERE id = NEW.shift_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "event_shift_signups_count" AFTER INSERT OR DELETE ON "social"."event_shift_signups" FOR EACH ROW EXECUTE FUNCTION "social"."event_shift_signups_count"();
