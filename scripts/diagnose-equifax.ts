// Finds out why Equifax's sandbox or UAT refuses requests. Sends a few blank enquiries, no applicant
// details, and prints only statuses and error text. Run on the server (see deploy/README.md):
//   npx tsx --env-file=.env scripts/diagnose-equifax.ts "Organization name"
import https from "node:https";
import http from "node:http";
import { db } from "../src/lib/db";
import { buildEquifaxProbeRequest, buildTokenRequest, classifyProbeResponse, DEFAULT_SCOPE, describeHttpError, reportHeaders, type EquifaxCredentials } from "../src/lib/bureaus/equifax";
import { loadBureauCredentials } from "../src/lib/org-bureaus";

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

  const headers = reportHeaders(token);
  const { Authorization: _a, ...noToken } = headers;
  const full = buildEquifaxProbeRequest(creds);
  // Never sends a made-up password: repeated wrong logins could lock the account.
  const { Password: _p, SecurityCode: _s, ...noSecrets } = full.RequestHeader;
  const sibling = (name: string) => creds.endpointUrl.replace(/[^/]+$/, name);
  const tests: [string, () => Promise<Reply>][] = [
    ["1. As CredCap sends it", () => fetchPost(creds.endpointUrl, headers, JSON.stringify(full))],
    ["2. Same, without the headers Node adds", () => plainPost(creds.endpointUrl, headers, JSON.stringify(full))],
    ["3. No password or security code", () => plainPost(creds.endpointUrl, headers, JSON.stringify({ ...full, RequestHeader: noSecrets }))],
    ["4. Empty request", () => plainPost(creds.endpointUrl, headers, "{}")],
    ["5. Asking for JSON only", () => plainPost(creds.endpointUrl, { ...headers, Accept: "application/json" }, JSON.stringify(full))],
    ["6. Made-up token", () => plainPost(creds.endpointUrl, { ...headers, Authorization: "Bearer not-a-real-token-000000000" }, "{}")],
    ["7. No token", () => plainPost(creds.endpointUrl, noToken, "{}")],
    // The product's other documented endpoint (UAT and production only), with harmless content.
    ["8. PDF endpoint, empty request", () => plainPost(sibling("cir360PDF"), headers, "{}")],
  ];

  const blocked: (boolean | null)[] = [];
  const statuses: number[] = [];
  for (const [label, run] of tests) {
    try {
      const r = await run();
      statuses.push(r.status);
      blocked.push(/not allowed|<!doctype|<html/i.test(r.text));
      const json = parse(r.text);
      const summary =
        r.status === 200 ? `HTTP 200. ${label.startsWith("8") ? "" : classifyProbeResponse(json).message}` : describeHttpError(r.status, json);
      console.log(`${label}: ${summary}${r.remote ? ` [${r.remote}]` : ""}${r.trace ? `\n   efx-transaction-id ${r.trace}` : ""}`);
    } catch (err) {
      blocked.push(null);
      statuses.push(0);
      console.log(`${label}: failed (${err instanceof Error ? err.message : "error"})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const [now, plain, noLogin, empty, jsonOnly, , , pdf] = blocked;
  const [, , , , , fake, none] = statuses;
  console.log(
    "\nToken: " +
      (statuses[0] === 401
        ? "refused by the report API."
        : fake === 401 && none === 401
          ? "accepted. Equifax refuses a made-up or missing token (401), but not this one."
          : "unclear: Equifax didn't answer 401 to a made-up or missing token."),
  );
  console.log(
    "Result: " +
      (blocked.slice(0, 5).includes(null)
        ? "unclear, because a test failed to complete."
        : !now
          ? `CredCap's request isn't blocked.${jsonOnly ? " Asking for JSON only still is." : ""}`
          : !plain
            ? "blocked because of headers Node adds. Fixable in CredCap."
            : !noLogin
              ? "blocked, but not without the password and security code."
              : !empty
                ? "blocked because of something in the request body."
                : `blocked whatever was tried here${pdf === false ? ", except on the PDF endpoint" : ""}. This doesn't prove whose side it's on.`),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
