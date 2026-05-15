import { sql } from "drizzle-orm";
import type { EmailJudgment } from "@/lib/types";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

export const companyStatus = pgEnum("company_status", [
  "discovered",
  "enriched",
  "rejected",
]);

export const emailStatus = pgEnum("email_status", [
  "draft",
  "sent",
  "failed",
]);

export const icps = pgTable("icps", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
  minEmployees: integer("min_employees"),
  maxEmployees: integer("max_employees"),
  geos: text("geos").array().notNull().default(sql`'{}'::text[]`),
  techKeywords: text("tech_keywords").array().notNull().default(sql`'{}'::text[]`),
  targetTitles: text("target_titles").array().notNull().default(sql`'{}'::text[]`),
  buyerPersona: text("buyer_persona").notNull().default(""),
  extraContext: text("extra_context").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    icpId: uuid("icp_id")
      .notNull()
      .references(() => icps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    linkedinUrl: text("linkedin_url"),
    industry: text("industry"),
    employeeRange: text("employee_range"),
    geo: text("geo"),
    description: text("description"),
    sourceUrl: text("source_url"),
    matchReason: text("match_reason"),
    status: companyStatus("status").notNull().default("discovered"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("companies_icp_idx").on(t.icpId)],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    emailAddress: text("email_address"),
    score: integer("score"),
    scoreReason: text("score_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("people_company_idx").on(t.companyId)],
);

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    toAddress: text("to_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    originalSubject: text("original_subject"),
    originalBody: text("original_body"),
    status: emailStatus("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    resendId: text("resend_id"),
    errorMessage: text("error_message"),
    judgeResult: jsonb("judge_result").$type<EmailJudgment>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("emails_person_idx").on(t.personId)],
);

export const styleLessons = pgTable(
  "style_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    icpId: uuid("icp_id")
      .notNull()
      .references(() => icps.id, { onDelete: "cascade" }),
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    lesson: text("lesson").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("style_lessons_icp_idx").on(t.icpId)],
);

export type Icp = typeof icps.$inferSelect;
export type NewIcp = typeof icps.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type StyleLesson = typeof styleLessons.$inferSelect;
export type NewStyleLesson = typeof styleLessons.$inferInsert;
