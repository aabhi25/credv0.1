import { bureauStatus, BUREAUS, type BureauCode, type BureauStatus, type StoredCredentials } from "./bureaus";
import { db } from "./db";
import { decryptJson } from "./secrets";

/** Bureaus a superadmin has enabled for this organization, in display order. */
export async function enabledBureaus(organizationId: string): Promise<BureauCode[]> {
  const rows = await db.bureauSetting.findMany({ where: { organizationId, enabled: true }, select: { bureau: true } });
  const on = new Set(rows.map((r) => r.bureau));
  return BUREAUS.filter((b) => on.has(b));
}

/** Integration status of every bureau for one organization (depends on its saved credentials). */
export async function orgBureauStatuses(organizationId: string): Promise<Record<BureauCode, BureauStatus>> {
  const rows = await db.bureauCredential.findMany({ where: { organizationId }, select: { bureau: true } });
  const withCreds = new Set(rows.map((r) => r.bureau));
  return Object.fromEntries(BUREAUS.map((b) => [b, bureauStatus(b, withCreds.has(b))])) as Record<BureauCode, BureauStatus>;
}

/** Decrypted credentials for one organization and bureau, or null. Server-only; never send to the browser. */
export async function loadBureauCredentials(organizationId: string, bureau: BureauCode): Promise<StoredCredentials | null> {
  const row = await db.bureauCredential.findUnique({ where: { organizationId_bureau: { organizationId, bureau } } });
  if (!row) return null;
  return { ...decryptJson<Record<string, string>>(row.encrypted), endpointUrl: row.endpointUrl };
}
