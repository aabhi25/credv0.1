"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
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

  const admin = await db.adminUser.findUnique({ where: { email } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return { error: "Incorrect email or password" };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(admin.id), sessionCookieOptions);
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}
