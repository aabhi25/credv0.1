import type { Prisma } from "@prisma/client";

export type ApplicantFilters = { program?: string; status?: string; q?: string };

export function applicantWhere(f: ApplicantFilters): Prisma.EligibilityCheckWhereInput {
  const where: Prisma.EligibilityCheckWhereInput = {};
  if (f.program) where.programId = f.program;
  if (f.status && ["APPROVED", "DECLINED", "ERROR"].includes(f.status)) where.status = f.status;
  const q = f.q?.trim();
  if (q) where.OR = [{ name: { contains: q } }, { mobile: { contains: q } }, { panMasked: { contains: q.toUpperCase() } }];
  return where;
}
