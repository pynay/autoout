import { z } from "zod";

export const icpInputSchema = z.object({
  name: z.string().min(1).max(120),
  industries: z.array(z.string().min(1)).max(20).default([]),
  minEmployees: z.number().int().nonnegative().nullable().optional(),
  maxEmployees: z.number().int().nonnegative().nullable().optional(),
  geos: z.array(z.string().min(1)).max(20).default([]),
  techKeywords: z.array(z.string().min(1)).max(40).default([]),
  targetTitles: z.array(z.string().min(1)).max(40).default([]),
  buyerPersona: z.string().max(2000).default(""),
  extraContext: z.string().max(4000).default(""),
});

export type IcpInput = z.infer<typeof icpInputSchema>;

export const icpUpdateSchema = icpInputSchema.partial();

export const draftEmailUpdateSchema = z.object({
  toAddress: z.string().email().nullable().optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
});
