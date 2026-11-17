"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { runEligibilityCheck } from "@/lib/eligibility";
import { rateLimit } from "@/lib/rate-limit";
import { applicantSchema } from "@/lib/validation";

export type CheckState =
  | { kind: "idle" }
  | { kind: "invalid"; errors: Record<string, string>; values: Record<string, string> }
  | { kind: "result"; status: "APPROVED" | "DECLINED" | "ERROR"; approvedLimit: number; name: string }
  | { kind: "unavailable"; message: string };

export async function checkEligibility(slug: string, _prev: CheckState, formData: FormData): Promise<CheckState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    pan: String(formData.get("pan") ?? ""),
    dob: String(formData.get("dob") ?? ""),
  };

  const errors: Record<string, string> = {};
  if (formData.get("consent") !== "on") errors.consent = "Please give consent to fetch your credit report";
  const parsed = applicantSchema.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
  }
  if (!parsed.success || Object.keys(errors).length) return { kind: "invalid", errors, values };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!rateLimit(`check:${ip}`, 5, 60_000)) {
    return { kind: "unavailable", message: "Too many attempts. Please wait a minute and try again." };
  }

  const program = await db.program.findUnique({ where: { slug } });
  if (!program || !program.active) {
    return { kind: "unavailable", message: "This eligibility link is no longer active." };
  }

  const outcome = await runEligibilityCheck(program, parsed.data, "LINK");
  return { kind: "result", status: outcome.status, approvedLimit: outcome.approvedLimit, name: parsed.data.name };
}
