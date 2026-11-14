ALTER TABLE "waitlist"."entries" ALTER COLUMN "org_name" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "waitlist"."entries" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "waitlist"."entries" ADD COLUMN "source" text;