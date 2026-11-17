"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth";
import { BUREAUS } from "@/lib/bureaus/types";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

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
