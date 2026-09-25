-- extracted verbatim from migrations/0000_sweet_joseph.sql (the Drizzle baseline, C2C set index 0)
CREATE TABLE "electronic_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"signature_type" varchar(50) NOT NULL,
	"signature_purpose" text NOT NULL,
	"signature_level" integer DEFAULT 1,
	"signer_id" integer NOT NULL,
	"signer_name" text NOT NULL,
	"signer_title" text,
	"signer_email" text NOT NULL,
	"authentication_method" varchar(50) NOT NULL,
	"authentication_timestamp" timestamp NOT NULL,
	"second_factor_verified" boolean DEFAULT false,
	"signature_hash" varchar(256) NOT NULL,
	"signature_meaning" text,
	"signature_manifest" json,
	"is_valid" boolean DEFAULT true,
	"verification_status" varchar(50),
	"verification_date" timestamp,
	"compliance_statement" text,
	"legal_disclaimer" text,
	"ip_address" varchar(45),
	"device_info" json,
	"signed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"old_values" json,
	"new_values" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
