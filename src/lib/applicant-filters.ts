import type { Prisma } from "@prisma/client";

export type ApplicantFilters = { program?: string; status?: string; q?: string };

/** Always scoped to one organization, so admins only ever see their own applicants. */
export function applicantWhere(organizationId: string, f: ApplicantFilters): Prisma.EligibilityCheckWhereInput {
  const where: Prisma.EligibilityCheckWhereInput = { program: { organizationId } };
  if (f.program) where.programId = f.program;
  if (f.status && ["APPROVED", "DECLINED", "ERROR"].includes(f.status)) where.status = f.status;
  const q = f.q?.trim();
  if (q) where.OR = [{ name: { contains: q } }, { mobile: { contains: q } }, { panMasked: { contains: q.toUpperCase() } }];
  return where;
}
