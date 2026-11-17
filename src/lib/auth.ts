import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export type Role = "SUPERADMIN" | "ADMIN";

/** The signed-in user, or null if the session is invalid, revoked, or the account or organization is disabled. */
export async function getSessionUser() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.adminUser.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      sessionVersion: true,
      organizationId: true,
      organization: { select: { id: true, name: true, active: true } },
    },
  });
  if (!user || !user.active || user.sessionVersion !== session.ver) return null;
  if (user.role === "ADMIN" && !user.organization?.active) return null;
  // Only superadmins can view an organization as its admin.
  return { ...user, viewingOrganizationId: user.role === "SUPERADMIN" ? (session.org ?? null) : null };
}

export function homeFor(role: string) {
  return role === "SUPERADMIN" ? "/superadmin" : "/admin";
}

/**
 * Who is acting as the organization admin: the admin themselves, or a superadmin viewing
 * that organization. `admin` is null when the signed-in user can't use the admin panel.
 */
export async function getAdminContext() {
  const user = await getSessionUser();
  if (!user) return { user: null, admin: null };
  const base = { id: user.id, email: user.email, name: user.name, role: user.role };
  if (user.role === "ADMIN" && user.organization) {
    return { user, admin: { ...base, organizationId: user.organization.id, organization: user.organization, viewingAsSuperadmin: false } };
  }
  if (user.role === "SUPERADMIN" && user.viewingOrganizationId) {
    const organization = await db.organization.findUnique({
      where: { id: user.viewingOrganizationId },
      select: { id: true, name: true, active: true },
    });
    if (organization) {
      return { user, admin: { ...base, organizationId: organization.id, organization, viewingAsSuperadmin: true } };
    }
  }
  return { user, admin: null };
}

/** Organization admin (or a superadmin viewing an organization). Use at the top of every /admin page, route and action. */
export async function requireAdmin() {
  const { user, admin } = await getAdminContext();
  if (!user) redirect("/admin/login");
  if (!admin) redirect(homeFor(user.role));
  return admin;
}

/** Platform owner. Use at the top of every /superadmin page and server action. */
export async function requireSuperadmin() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "SUPERADMIN") redirect(homeFor(user.role));
  return user;
}
