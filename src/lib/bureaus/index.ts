import { createEquifaxAdapter, type EquifaxCredentials } from "./equifax";
import { BureauError, BUREAU_LABELS, INTEGRATED_BUREAUS, type BureauAdapter, type BureauCode, type BureauStatus } from "./types";

export * from "./types";

/** Stored credentials: the endpoint plus the bureau's own fields (see CREDENTIAL_FIELDS). */
export type StoredCredentials = { endpointUrl: string } & Record<string, string>;

/** Built bureau integrations. Add a bureau here and to INTEGRATED_BUREAUS in types.ts. */
const INTEGRATIONS: Partial<Record<BureauCode, (creds: StoredCredentials) => BureauAdapter>> = {
  EQUIFAX: (creds) => createEquifaxAdapter(creds as unknown as EquifaxCredentials),
};

export function isIntegrated(code: BureauCode) {
  return Boolean(INTEGRATIONS[code]);
}

export function bureauStatus(code: BureauCode, hasCredentials: boolean): BureauStatus {
  if (!isIntegrated(code)) return "NOT_INTEGRATED";
  return hasCredentials ? "READY" : "NEEDS_CREDENTIALS";
}

export function getBureauAdapter(code: BureauCode, creds: StoredCredentials | null): BureauAdapter {
  const build = INTEGRATIONS[code];
  if (!build) throw new BureauError(`${BUREAU_LABELS[code]} is not integrated yet`, "NOT_INTEGRATED");
  if (!creds) throw new BureauError(`${BUREAU_LABELS[code]} API credentials are not configured`, "NO_CREDENTIALS");
  return build(creds);
}

// Guard against the client-safe list drifting from the real registry.
for (const code of INTEGRATED_BUREAUS) {
  if (!INTEGRATIONS[code]) throw new Error(`INTEGRATED_BUREAUS lists ${code} but it has no integration`);
}
