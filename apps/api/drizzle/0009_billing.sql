CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TABLE "billing"."invoice_counters" (
	"org_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_org_id_year_pk" PRIMARY KEY("org_id","year")
);
--> statement-breakpoint
CREATE TABLE "billing"."invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cents" integer NOT NULL,
	"vat_rate" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_user_id" uuid,
	"recipient_name" text NOT NULL,
	"recipient_address" text DEFAULT '' NOT NULL,
	"issuer_name" text NOT NULL,
	"issuer_city" text DEFAULT '' NOT NULL,
	"issue_date" date,
	"due_date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"vat_note" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"overdue_notified_at" timestamp with time zone,
	CONSTRAINT "invoices_org_number_unique" UNIQUE("org_id","number")
);
--> statement-breakpoint
ALTER TABLE "billing"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "billing"."invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoices_org_created_idx" ON "billing"."invoices" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_recipient_idx" ON "billing"."invoices" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "invoices_open_due_idx" ON "billing"."invoices" USING btree ("status","due_date");