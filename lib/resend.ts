import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("[resend] RESEND_API_KEY is not set — email send will fail.");
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? "missing");

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "Autoout <onboarding@resend.dev>";
