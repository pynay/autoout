-- Allow global lessons (icpId = null) and make emailId optional
ALTER TABLE "style_lessons" ALTER COLUMN "icp_id" DROP NOT NULL;
ALTER TABLE "style_lessons" ALTER COLUMN "email_id" DROP NOT NULL;

-- Add weighting/decay columns
ALTER TABLE "style_lessons" ADD COLUMN "usage_count" integer NOT NULL DEFAULT 1;
ALTER TABLE "style_lessons" ADD COLUMN "last_used_at" timestamp with time zone NOT NULL DEFAULT now();

-- Change email_id onDelete from cascade to set null
ALTER TABLE "style_lessons" DROP CONSTRAINT IF EXISTS "style_lessons_email_id_emails_id_fk";
ALTER TABLE "style_lessons" ADD CONSTRAINT "style_lessons_email_id_emails_id_fk"
  FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE SET NULL;
