import { BUREAUS, type BureauCode } from "./bureaus";
import { db } from "./db";

/** Bureaus a superadmin has enabled for this organization, in display order. */
export async function enabledBureaus(organizationId: string): Promise<BureauCode[]> {
  const rows = await db.bureauSetting.findMany({ where: { organizationId, enabled: true }, select: { bureau: true } });
  const on = new Set(rows.map((r) => r.bureau));
  return BUREAUS.filter((b) => on.has(b));
}
