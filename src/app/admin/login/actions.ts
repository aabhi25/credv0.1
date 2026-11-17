"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) return { error: "Too many attempts. Try again later." };

  const user = await db.adminUser.findUnique({ where: { email }, include: { organization: true } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email/username or password" };
  }
  if (!user.active || (user.role === "ADMIN" && !user.organization?.active)) {
    return { error: "This account is disabled. Contact your administrator." };
  }

  await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user.id, user.sessionVersion), sessionCookieOptions);
  redirect(homeFor(user.role));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}
