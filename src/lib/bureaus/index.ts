import { BureauError, BUREAU_LABELS, BUREAUS, type BureauAdapter, type BureauCode, type BureauStatus } from "./types";

export * from "./types";

type Credentials = { url: string; key: string };

/**
 * Real bureau integrations. Each entry builds an adapter that calls the bureau's API and maps
 * its response to a BureauReport. None are built yet: each bureau needs member onboarding and
 * its own API documentation before it can be added here.
 */
const INTEGRATIONS: Partial<Record<BureauCode, (creds: Credentials) => BureauAdapter>> = {};

export function bureauCredentials(code: BureauCode): Credentials | null {
  const url = process.env[`${code}_API_URL`];
  const key = process.env[`${code}_API_KEY`];
  return url && key ? { url, key } : null;
}

export function getBureauStatus(code: BureauCode): BureauStatus {
  if (!INTEGRATIONS[code]) return "NOT_INTEGRATED";
  if (!bureauCredentials(code)) return "NEEDS_CREDENTIALS";
  return "READY";
}

export function allBureauStatuses(): Record<BureauCode, BureauStatus> {
  return Object.fromEntries(BUREAUS.map((b) => [b, getBureauStatus(b)])) as Record<BureauCode, BureauStatus>;
}

export function getBureauAdapter(code: BureauCode): BureauAdapter {
  const build = INTEGRATIONS[code];
  const creds = bureauCredentials(code);
  if (!build) throw new BureauError(`${BUREAU_LABELS[code]} is not integrated yet`);
  if (!creds) throw new BureauError(`${BUREAU_LABELS[code]} API credentials are not configured`);
  return build(creds);
}
