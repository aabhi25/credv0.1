import Papa from "papaparse";
import { applicantWhere } from "@/lib/applicant-filters";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseReasons } from "@/lib/eligibility";

// Spreadsheet apps execute cells starting with these characters as formulas.
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN" || !user.organizationId) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const checks = await db.eligibilityCheck.findMany({
    where: applicantWhere(user.organizationId, sp),
    orderBy: { createdAt: "desc" },
    take: 50_000,
    include: { program: { select: { name: true, category: true } } },
  });

  const csv = Papa.unparse(
    checks.map((c) => ({
      checked_at: c.createdAt.toISOString(),
      name: safe(c.name),
      mobile: c.mobile,
      pan: c.panMasked,
      age: c.age,
      program: safe(c.program.name),
      category: safe(c.program.category),
      bureau: c.bureau,
      api_mode: c.apiMode,
      source: c.source,
      score: c.score ?? "",
      dti_pct: c.dtiPct ?? "",
      defaults: c.defaults ?? "",
      result: c.status === "APPROVED" ? "Eligible" : c.status === "DECLINED" ? "Not eligible" : "Error",
      approved_limit: c.approvedLimit,
      reasons: parseReasons(c.reasons).join("; "),
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applicants-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
