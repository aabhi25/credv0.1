import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function getAdmin() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return db.adminUser.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true },
  });
}

/** Use at the top of every admin page and server action. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
