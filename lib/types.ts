import type { Icp, Company, Person, Email } from "@/lib/db/schema";

export type { Icp, Company, Person, Email };

export type IcpDetail = {
  icp: Icp;
  companies: Company[];
  people: Person[];
  emails: Email[];
};

export type DiscoveredCompany = {
  name: string;
  domain: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  employeeRange: string | null;
  geo: string | null;
  description: string | null;
  sourceUrl: string | null;
  matchReason: string | null;
};

export type RankedPerson = {
  fullName: string;
  title: string | null;
  linkedinUrl: string | null;
  location: string | null;
  score: number;
  scoreReason: string;
};

export type EmailDraft = {
  subject: string;
  body: string;
};

export type JudgeDimension = {
  score: number; // 0–10
  feedback: string;
};

export type EmailJudgment = {
  personalization: JudgeDimension;
  clarity: JudgeDimension;
  cta: JudgeDimension;
  tone: JudgeDimension;
  wordCount: number;
  overall: JudgeDimension;
};
