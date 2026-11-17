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
  return user;
}

export function homeFor(role: string) {
  return role === "SUPERADMIN" ? "/superadmin" : "/admin";
}

/** Organization admin. Use at the top of every /admin page, route and server action. */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN" || !user.organization) redirect(homeFor(user.role));
  return { ...user, organizationId: user.organization.id, organization: user.organization };
}

/** Platform owner. Use at the top of every /superadmin page and server action. */
export async function requireSuperadmin() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "SUPERADMIN") redirect(homeFor(user.role));
  return user;
}
