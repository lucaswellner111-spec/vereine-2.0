CREATE TABLE "social"."org_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "issuer_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "issuer_iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."invoices" ADD COLUMN "issuer_tax_info" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."organizations" ADD COLUMN "tax_info" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social"."org_invites" ADD CONSTRAINT "org_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "social"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_invites_org_idx" ON "social"."org_invites" USING btree ("org_id","created_at");