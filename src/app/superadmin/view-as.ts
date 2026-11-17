"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, requireSuperadmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** Opens an organization's admin panel as a superadmin, without needing any admin's password. */
export async function viewOrganization(orgId: string) {
  const user = await requireSuperadmin();
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) notFound();
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user.id, user.sessionVersion, org.id), sessionCookieOptions);
  redirect("/admin");
}

/** Leaves the organization's admin panel and returns to its superadmin page. */
export async function exitOrganizationView() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPERADMIN") redirect("/admin/login");
  const orgId = user.viewingOrganizationId;
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user.id, user.sessionVersion), sessionCookieOptions);
  redirect(orgId ? `/superadmin/organizations/${orgId}` : "/superadmin");
}
