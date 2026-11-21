import { bureauStatus, BUREAUS, CREDENTIAL_FIELDS, type BureauCode, type BureauStatus, type StoredCredentials } from "./bureaus";
import { db } from "./db";
import { decryptJson } from "./secrets";

/** Bureaus a superadmin has enabled for this organization, in display order. */
export async function enabledBureaus(organizationId: string): Promise<BureauCode[]> {
  const rows = await db.bureauSetting.findMany({ where: { organizationId, enabled: true }, select: { bureau: true } });
  const on = new Set(rows.map((r) => r.bureau));
  return BUREAUS.filter((b) => on.has(b));
}

/**
 * Whether saved credentials have every required field. Credentials saved for an older connection
 * method (e.g. Equifax before OAuth) or under a different CREDENTIALS_KEY count as incomplete.
 */
export function credentialsComplete(bureau: string, encrypted: string): boolean {
  let values: Record<string, string>;
  try {
    values = decryptJson<Record<string, string>>(encrypted);
  } catch {
    return false;
  }
  return (CREDENTIAL_FIELDS[bureau as BureauCode] ?? []).every((f) => f.optional || values[f.key]);
}

/** Names (never values) of the fields that have a saved value, so forms can say which are already set. */
export function savedCredentialKeys(encrypted: string): string[] {
  try {
    return Object.entries(decryptJson<Record<string, string>>(encrypted))
      .filter(([, v]) => v)
      .map(([k]) => k);
  } catch {
    return [];
  }
}

export async function hasUsableCredentials(organizationId: string, bureau: BureauCode): Promise<boolean> {
  const row = await db.bureauCredential.findUnique({
    where: { organizationId_bureau: { organizationId, bureau } },
    select: { encrypted: true },
  });
  return Boolean(row && credentialsComplete(bureau, row.encrypted));
}

/** Integration status of every bureau for one organization (depends on its saved credentials). */
export async function orgBureauStatuses(organizationId: string): Promise<Record<BureauCode, BureauStatus>> {
  const rows = await db.bureauCredential.findMany({ where: { organizationId }, select: { bureau: true, encrypted: true } });
  const usable = new Set(rows.filter((r) => credentialsComplete(r.bureau, r.encrypted)).map((r) => r.bureau));
  return Object.fromEntries(BUREAUS.map((b) => [b, bureauStatus(b, usable.has(b))])) as Record<BureauCode, BureauStatus>;
}

/** Decrypted credentials for one organization and bureau, or null. Server-only; never send to the browser. */
export async function loadBureauCredentials(organizationId: string, bureau: BureauCode): Promise<StoredCredentials | null> {
  const row = await db.bureauCredential.findUnique({ where: { organizationId_bureau: { organizationId, bureau } } });
  if (!row) return null;
  return { ...decryptJson<Record<string, string>>(row.encrypted), endpointUrl: row.endpointUrl };
}
