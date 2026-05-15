CREATE TYPE "public"."company_status" AS ENUM('discovered', 'enriched', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('draft', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"icp_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"linkedin_url" text,
	"industry" text,
	"employee_range" text,
	"geo" text,
	"description" text,
	"source_url" text,
	"match_reason" text,
	"status" "company_status" DEFAULT 'discovered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"to_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"original_subject" text,
	"original_body" text,
	"status" "email_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"resend_id" text,
	"error_message" text,
	"judge_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_employees" integer,
	"max_employees" integer,
	"geos" text[] DEFAULT '{}'::text[] NOT NULL,
	"tech_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_titles" text[] DEFAULT '{}'::text[] NOT NULL,
	"buyer_persona" text DEFAULT '' NOT NULL,
	"extra_context" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"linkedin_url" text,
	"location" text,
	"email_address" text,
	"score" integer,
	"score_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"icp_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"lesson" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_lessons" ADD CONSTRAINT "style_lessons_icp_id_icps_id_fk" FOREIGN KEY ("icp_id") REFERENCES "public"."icps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_lessons" ADD CONSTRAINT "style_lessons_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_icp_idx" ON "companies" USING btree ("icp_id");--> statement-breakpoint
CREATE INDEX "emails_person_idx" ON "emails" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_company_idx" ON "people" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "style_lessons_icp_idx" ON "style_lessons" USING btree ("icp_id");