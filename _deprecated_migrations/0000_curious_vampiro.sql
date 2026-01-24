CREATE TABLE "csr_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"study_design" text,
	"primary_objective" text,
	"study_description" text,
	"inclusion_criteria" text,
	"exclusion_criteria" text,
	"treatment_arms" jsonb,
	"study_duration" text,
	"endpoints" jsonb,
	"results" jsonb,
	"safety" jsonb,
	"processing_status" varchar(50) DEFAULT 'pending',
	"processed" boolean DEFAULT false,
	"extraction_date" timestamp DEFAULT now(),
	"sample_size" integer,
	"age_range" varchar(100),
	"gender_distribution" jsonb,
	"statistical_methods" jsonb,
	"adverse_events" jsonb,
	"efficacy_results" jsonb,
	"sae_count" integer,
	"teae_count" integer,
	"completion_rate" numeric(5, 2),
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "csr_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"sponsor" varchar(255) NOT NULL,
	"indication" varchar(255) NOT NULL,
	"phase" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'Processing' NOT NULL,
	"date" date,
	"upload_date" timestamp DEFAULT now() NOT NULL,
	"summary" text,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"file_path" text,
	"nctrial_id" varchar(50),
	"study_id" varchar(100),
	"drug_name" varchar(255),
	"region" varchar(100),
	"last_updated" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "csr_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"segment_number" integer NOT NULL,
	"segment_type" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"page_numbers" varchar(100),
	"extracted_entities" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"standardized_term" varchar(255),
	"taxonomy_code" varchar(100),
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'user',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "csr_details" ADD CONSTRAINT "csr_details_report_id_csr_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."csr_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csr_segments" ADD CONSTRAINT "csr_segments_report_id_csr_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."csr_reports"("id") ON DELETE cascade ON UPDATE no action;