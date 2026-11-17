import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// First line of defence; pages and actions also call requireAdmin().
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") return NextResponse.next();
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/admin/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
