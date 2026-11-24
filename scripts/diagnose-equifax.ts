// Finds out why Equifax's sandbox or UAT refuses requests. Sends a few blank enquiries, no applicant
// details, and prints only statuses and error text. Run on the server (see deploy/README.md):
//   npx tsx --env-file=.env scripts/diagnose-equifax.ts "Organization name"
import https from "node:https";
import http from "node:http";
import { db } from "../src/lib/db";
import { buildEquifaxProbeRequest, buildTokenRequest, DEFAULT_SCOPE, describeHttpError, type EquifaxCredentials } from "../src/lib/bureaus/equifax";
import { loadBureauCredentials } from "../src/lib/org-bureaus";

const USER_AGENT = "CredCap/1.0";
type Reply = { status: number; text: string; remote?: string; trace?: string };

/** Equifax's own ID for a request, which its engineers can look up. */
function traceId(value: unknown) {
  return typeof value === "string" && /^[\w-]{8,64}$/.test(value) ? value : undefined;
}

/** Sends exactly these headers; Node's fetch adds its own (user-agent: node, sec-fetch-mode, ...). */
function plainPost(url: string, headers: Record<string, string>, body: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("http:") ? http : https;
    const req = client.request(
      url,
      { method: "POST", headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) }, timeout: 60_000 },
      (res) => {
        let text = "";
        const remote = `IPv${res.socket.remoteFamily === "IPv6" ? 6 : 4}`;
        res.setEncoding("utf8").on("data", (c) => (text += c)).on("end", () => resolve({ status: res.statusCode ?? 0, text, remote, trace: traceId(res.headers["efx-transaction-id"]) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("no answer within 60 s")));
    req.on("error", reject);
    req.end(body);
  });
}

async function fetchPost(url: string, headers: Record<string, string>, body: string): Promise<Reply> {
  const res = await fetch(url, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  return { status: res.status, text: await res.text(), trace: traceId(res.headers.get("efx-transaction-id")) };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { description: text };
  }
}

async function main() {
  const name = process.argv[2];
  const org = name ? await db.organization.findFirst({ where: { name } }) : null;
  if (!org) throw new Error(`Give an organization name: ${(await db.organization.findMany()).map((o) => o.name).join(", ")}`);
  const creds = (await loadBureauCredentials(org.id, "EQUIFAX")) as EquifaxCredentials | null;
  if (!creds?.tokenUrl) throw new Error("This organization has no Equifax credentials.");
  const host = new URL(creds.endpointUrl).hostname;
  const local = process.env.NODE_ENV !== "production" && host === "127.0.0.1";
  if (!local && !/^api\.(uat|sandbox)\.equifax\.co\.in$/.test(host)) throw new Error("Only for Equifax's sandbox and UAT.");

  console.log(`Equifax host: ${host}   client ID ends: ${(creds.clientId ?? "").slice(-4)}   ${new Date().toISOString()}`);
  const tokenRes = await fetch(creds.tokenUrl, { ...buildTokenRequest(creds), signal: AbortSignal.timeout(20_000) });
  const grant = parse(await tokenRes.text()) as { access_token?: string; token_type?: string; expires_in?: unknown; scope?: string };
  const token = grant.access_token;
  console.log(`0. Sign-in: HTTP ${tokenRes.status}${token ? ", token received" : `, no token: ${describeHttpError(tokenRes.status, grant)}`}`);
  if (!token) return;
  // Facts about the token, never the token itself.
  console.log(
    `   Token: type ${grant.token_type ?? "?"}, valid ${grant.expires_in ?? "?"} s, scope ${grant.scope ?? "(none)"}, ` +
      `asked for ${creds.scope || DEFAULT_SCOPE}, clean text: ${/^[\x21-\x7e]+$/.test(token) ? "yes" : "NO"}`,
  );

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  const clear = { ...auth, "User-Agent": USER_AGENT };
  const full = buildEquifaxProbeRequest(creds);
  // Never sends a made-up password: repeated wrong logins could lock the account.
  const { Password: _p, SecurityCode: _s, ...noSecrets } = full.RequestHeader;
  const tests: [string, () => Promise<Reply>][] = [
    ["1. As CredCap sends it now", () => fetchPost(creds.endpointUrl, auth, JSON.stringify(full))],
    ["2. Same, with plain headers", () => plainPost(creds.endpointUrl, clear, JSON.stringify(full))],
    ["3. Plain headers, no password or security code", () => plainPost(creds.endpointUrl, clear, JSON.stringify({ ...full, RequestHeader: noSecrets }))],
    ["4. Plain headers, empty request", () => plainPost(creds.endpointUrl, clear, "{}")],
  ];

  const { Authorization: _a, ...noToken } = clear;
  tests.push(
    ["5. Made-up token", () => plainPost(creds.endpointUrl, { ...clear, Authorization: "Bearer not-a-real-token-000000000" }, "{}")],
    ["6. No token", () => plainPost(creds.endpointUrl, noToken, "{}")],
  );

  const blocked: (boolean | null)[] = [];
  const statuses: number[] = [];
  for (const [label, run] of tests) {
    try {
      const r = await run();
      statuses.push(r.status);
      blocked.push(/not allowed|<!doctype|<html/i.test(r.text));
      const summary = r.status === 200 ? "Equifax replied normally (HTTP 200)" : describeHttpError(r.status, parse(r.text));
      console.log(`${label}: ${summary}${r.remote ? ` [${r.remote}]` : ""}${r.trace ? `\n   efx-transaction-id ${r.trace}` : ""}`);
    } catch (err) {
      blocked.push(null);
      statuses.push(0);
      console.log(`${label}: failed (${err instanceof Error ? err.message : "error"})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const [now, plain, noLogin, empty] = blocked;
  const [real, fake, none] = [statuses[3], statuses[4], statuses[5]];
  console.log(
    "\nToken: " +
      (fake === 401 && none === 401 && real !== 401
        ? "accepted. Equifax refuses a made-up or missing token (401), but not this one."
        : real === 401
          ? "refused by the report API."
          : "unclear: Equifax didn't answer 401 to a made-up or missing token."),
  );
  console.log(
    "Likely: " +
      (blocked.includes(null)
        ? "unclear, because a test failed to complete."
        : !now
        ? "no firewall block this time; see each result above."
        : !plain
          ? "the headers CredCap sends. Fixable in CredCap."
          : !noLogin
            ? "the password or security code text trips the firewall."
            : !empty
              ? "something else in the request body."
              : "not the request. Even an empty one is blocked: IP allow-listing, app access, or Equifax's own setup."),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
