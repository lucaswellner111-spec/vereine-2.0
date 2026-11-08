CREATE TABLE "billing"."fee_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"due_date" date NOT NULL,
	"fee_class_ids" uuid[] NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "fee_runs_org_period_unique" UNIQUE("org_id","period_label"),
	CONSTRAINT "fee_runs_status_chk" CHECK (status IN ('queued', 'running', 'done', 'failed')),
	CONSTRAINT "fee_runs_period_chk" CHECK (char_length(period_label) BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "fee_run_id" uuid;--> statement-breakpoint
CREATE INDEX "fee_runs_org_created_idx" ON "billing"."fee_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "fee_runs_status_idx" ON "billing"."fee_runs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_fee_run_id_fee_runs_id_fk" FOREIGN KEY ("fee_run_id") REFERENCES "billing"."fee_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_fee_run_recipient_unique" UNIQUE("fee_run_id","recipient_user_id");