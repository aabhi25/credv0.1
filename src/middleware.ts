import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Behind a proxy, req.url holds the internal address (localhost), so use the public one. */
function publicUrl(path: string, req: NextRequest) {
  if (process.env.APP_URL) return new URL(path, process.env.APP_URL);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL(path, req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

// First line of defence; pages and actions also call requireAdmin().
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") return NextResponse.next();
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(publicUrl("/admin/login", req));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/superadmin/:path*"] };
