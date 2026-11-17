"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth";
import { BureauError, getBureauAdapter } from "@/lib/bureaus";
import { INQUIRY_PURPOSES } from "@/lib/bureaus/codes";
import { BUREAUS, CREDENTIAL_FIELDS, INTEGRATED_BUREAUS, type BureauCode } from "@/lib/bureaus/types";
import { db } from "@/lib/db";
import { loadBureauCredentials } from "@/lib/org-bureaus";
import { hashPassword } from "@/lib/password";
import { decryptJson, encryptJson } from "@/lib/secrets";
import { applicantSchema, parseDob } from "@/lib/validation";

export type FormState = { errors?: Record<string, string>; ok?: string };

const name = z.string().trim().min(2, "Enter a name").max(80);
// Sign-in ID: an email address, or a plain username such as "superadmin".
const email = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => z.email().safeParse(v).success || /^[a-z0-9][a-z0-9._-]{2,39}$/.test(v), "Enter an email or a username (3+ letters/numbers)");
const password = z.string().min(8, "Use at least 8 characters").max(128);

function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

async function emailTaken(value: string, exceptUserId?: string) {
  const user = await db.adminUser.findUnique({ where: { email: value } });
  return Boolean(user && user.id !== exceptUserId);
}

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperadmin();
  const parsed = z
    .object({ orgName: name, adminName: name, adminEmail: email, adminPassword: password })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (await emailTaken(d.adminEmail)) return { errors: { adminEmail: "This email or username is already in use" } };

  const org = await db.organization.create({
    data: {
      name: d.orgName,
      // No bureaus until a superadmin enables them for this organization.
      bureaus: { create: BUREAUS.map((bureau) => ({ bureau, enabled: false })) },
      users: {
        create: { name: d.adminName, email: d.adminEmail, role: "ADMIN", passwordHash: await hashPassword(d.adminPassword) },
      },
    },
  });
  revalidatePath("/superadmin");
  redirect(`/superadmin/organizations/${org.id}`);
}

export async function renameOrganization(orgId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperadmin();
  const parsed = z.object({ orgName: name }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await db.organization.update({ where: { id: orgId }, data: { name: parsed.data.orgName } });
  revalidatePath("/superadmin", "layout");
  return { ok: "Saved" };
}

/** Disabling an organization signs out its admins and turns off all its public links. */
export async function setOrganizationActive(orgId: string, active: boolean) {
  await requireSuperadmin();
  await db.organization.update({ where: { id: orgId }, data: { active } });
  revalidatePath("/superadmin", "layout");
}

/** Creates an admin for an organization, or a superadmin when orgId is null. */
export async function createUser(orgId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperadmin();
  const parsed = z.object({ name, email, password }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (await emailTaken(parsed.data.email)) return { errors: { email: "This email or username is already in use" } };

  await db.adminUser.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: orgId ? "ADMIN" : "SUPERADMIN",
      organizationId: orgId,
    },
  });
  revalidatePath("/superadmin", "layout");
  return { ok: `Account created for ${parsed.data.email}` };
}

/** Updates name and email; a new password is optional and signs the user out everywhere. */
export async function updateUser(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperadmin();
  const raw = Object.fromEntries(formData);
  const parsed = z
    .object({ name, email, password: z.union([z.literal(""), password]) })
    .safeParse({ ...raw, password: raw.password ?? "" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (await emailTaken(parsed.data.email, userId)) return { errors: { email: "This email or username is already in use" } };

  const newPassword = parsed.data.password;
  await db.adminUser.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      ...(newPassword && { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } }),
    },
  });
  revalidatePath("/superadmin", "layout");
  return { ok: newPassword ? "Saved. Password changed and existing sessions signed out." : "Saved" };
}

export async function setUserActive(userId: string, active: boolean): Promise<{ error?: string }> {
  const me = await requireSuperadmin();
  if (userId === me.id) return { error: "You can't disable your own account" };
  await db.adminUser.update({
    where: { id: userId },
    data: { active, ...(!active && { sessionVersion: { increment: 1 } }) },
  });
  revalidatePath("/superadmin", "layout");
  return {};
}

/** Enables or disables a credit bureau for one organization. */
export async function setOrganizationBureau(orgId: string, bureau: string, enabled: boolean) {
  await requireSuperadmin();
  if (!BUREAUS.includes(bureau as (typeof BUREAUS)[number])) return;
  await db.bureauSetting.upsert({
    where: { organizationId_bureau: { organizationId: orgId, bureau } },
    update: { enabled },
    create: { organizationId: orgId, bureau, enabled },
  });
  revalidatePath("/superadmin", "layout");
  revalidatePath("/admin", "layout");
}

/**
 * Saves an organization's API credentials for a bureau (its own membership), encrypted.
 * When updating, a blank field keeps the value already saved, so secrets never have to be re-shown.
 */
export async function saveBureauCredentials(
  orgId: string,
  bureau: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperadmin();
  const code = bureau as BureauCode;
  const fields = CREDENTIAL_FIELDS[code];
  if (!INTEGRATED_BUREAUS.includes(code) || !fields) return { errors: { form: "This bureau isn't integrated" } };

  const existing = await db.bureauCredential.findUnique({ where: { organizationId_bureau: { organizationId: orgId, bureau } } });
  const previous = existing ? decryptJson<Record<string, string>>(existing.encrypted) : {};

  const errors: Record<string, string> = {};
  const endpointUrl = String(formData.get("endpointUrl") ?? "").trim() || existing?.endpointUrl || "";
  try {
    const url = new URL(endpointUrl);
    // http is only allowed for a local test server during development.
    const localDev = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(localDev && url.protocol === "http:")) errors.endpointUrl = "Use an https:// address";
  } catch {
    errors.endpointUrl = "Enter the full API address, e.g. https://…";
  }

  const values: Record<string, string> = {};
  for (const f of fields) {
    const typed = String(formData.get(f.key) ?? "").trim();
    const value = typed || previous[f.key] || "";
    if (!value) errors[f.key] = `${f.label} is required`;
    else if (value.length > f.maxLength) errors[f.key] = `${f.label} can be at most ${f.maxLength} characters`;
    values[f.key] = value;
  }
  if (Object.keys(errors).length) return { errors };

  // A non-secret label so the UI can show which account is saved without decrypting.
  const member = values.memberNumber ?? "";
  const hint = member ? `Member ••••${member.slice(-4)}` : "";
  await db.bureauCredential.upsert({
    where: { organizationId_bureau: { organizationId: orgId, bureau } },
    update: { endpointUrl, encrypted: encryptJson(values), hint },
    create: { organizationId: orgId, bureau, endpointUrl, encrypted: encryptJson(values), hint },
  });
  revalidatePath("/superadmin", "layout");
  revalidatePath("/admin", "layout");
  return { ok: existing ? "Credentials updated" : "Credentials saved" };
}

export async function removeBureauCredentials(orgId: string, bureau: string) {
  await requireSuperadmin();
  await db.bureauCredential.deleteMany({ where: { organizationId: orgId, bureau } });
  revalidatePath("/superadmin", "layout");
  revalidatePath("/admin", "layout");
}

export type BureauTestResult = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  report?: { hit: boolean; score: number | null; existingEmi: number; defaults: number; bureauRef: string | null };
};

async function recordTest(orgId: string, bureau: string, ok: boolean, message: string) {
  await db.bureauCredential.updateMany({
    where: { organizationId: orgId, bureau },
    data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestMessage: message.slice(0, 500) },
  });
  revalidatePath("/superadmin", "layout");
}

/** Checks the saved credentials without pulling a credit report. */
export async function testBureauConnection(orgId: string, bureau: string): Promise<BureauTestResult> {
  await requireSuperadmin();
  const code = bureau as BureauCode;
  const creds = await loadBureauCredentials(orgId, code);
  if (!creds) return { ok: false, message: "No credentials are saved for this bureau." };
  const adapter = getBureauAdapter(code, creds);
  if (!adapter.probe) return { ok: false, message: "A quick check isn't available for this bureau; run a test enquiry." };
  const result = await adapter.probe();
  await recordTest(orgId, bureau, result.ok, result.message);
  return { ok: result.ok, message: result.message };
}

const testApplicantSchema = applicantSchema.omit({ monthlyIncome: true });

/**
 * Pulls a real report for a test applicant (meant for the bureau's UAT test data).
 * Nothing is saved as an applicant; only the pass/fail result is recorded on the credentials.
 */
export async function runBureauTestEnquiry(
  orgId: string,
  bureau: string,
  _prev: BureauTestResult | null,
  formData: FormData,
): Promise<BureauTestResult> {
  await requireSuperadmin();
  const code = bureau as BureauCode;
  const parsed = testApplicantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Check the highlighted fields.", errors };
  }
  const purpose = String(formData.get("inquiryPurpose") ?? "05");
  const creds = await loadBureauCredentials(orgId, code);
  if (!creds) return { ok: false, message: "No credentials are saved for this bureau." };

  const a = parsed.data;
  try {
    const report = await getBureauAdapter(code, creds).fetchReport({
      name: a.name,
      pan: a.pan,
      mobile: a.mobile,
      dob: parseDob(a.dob)!,
      address: a.address,
      state: a.state,
      pincode: a.pincode,
      inquiryPurpose: INQUIRY_PURPOSES.some((p) => p.code === purpose) ? purpose : "05",
      reference: `credcap-test-${Date.now()}`,
    });
    const message = report.hit
      ? `Test enquiry succeeded: report ${report.bureauRef ?? "received"}${report.score !== null ? `, score ${report.score}` : ""}.`
      : "Test enquiry succeeded: Equifax has no credit file for this applicant.";
    await recordTest(orgId, bureau, true, message);
    return { ok: true, message, report };
  } catch (err) {
    const message = err instanceof BureauError ? err.message : "The test enquiry failed unexpectedly.";
    if (!(err instanceof BureauError)) console.error("Bureau test enquiry failed", err);
    await recordTest(orgId, bureau, false, message);
    return { ok: false, message };
  }
}
