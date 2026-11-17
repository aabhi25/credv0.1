// Signed admin session cookie. Uses Web Crypto so it runs in both middleware (edge) and Node.

export const SESSION_COOKIE = "pa_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

type SessionPayload = { uid: string; exp: number };

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(uid: string): Promise<string> {
  const payload: SessionPayload = { uid, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(sig),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
