"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runEligibilityCheck } from "@/lib/eligibility";
import { applicantSchema, programSchema } from "@/lib/validation";

export type ProgramFormState = { errors?: Record<string, string>; saved?: boolean };

export async function saveProgram(
  id: string | null,
  _prev: ProgramFormState,
  formData: FormData,
): Promise<ProgramFormState> {
  await requireAdmin();
  const parsed = programSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }

  const clash = await db.program.findUnique({ where: { slug: parsed.data.slug } });
  if (clash && clash.id !== id) return { errors: { slug: "Another program already uses this link" } };

  if (id) {
    await db.program.update({ where: { id }, data: parsed.data });
    revalidatePath("/admin", "layout");
    return { saved: true };
  }
  const created = await db.program.create({ data: parsed.data });
  revalidatePath("/admin", "layout");
  redirect(`/admin/programs/${created.id}`);
}

export async function deleteProgram(id: string) {
  await requireAdmin();
  await db.program.delete({ where: { id } });
  revalidatePath("/admin", "layout");
  redirect("/admin/programs");
}

export type BulkRow = { name: string; mobile: string; pan: string; dob: string };
export type BulkResult = { row: number; name: string; status: "APPROVED" | "DECLINED" | "ERROR" | "INVALID"; detail: string };

const MAX_BULK_ROWS = 500;

export async function runBulkCheck(programId: string, rows: BulkRow[]): Promise<{ results: BulkResult[]; error?: string }> {
  await requireAdmin();
  if (!Array.isArray(rows) || rows.length === 0) return { results: [], error: "The file has no rows" };
  if (rows.length > MAX_BULK_ROWS) return { results: [], error: `Upload at most ${MAX_BULK_ROWS} rows at a time` };

  const program = await db.program.findUnique({ where: { id: programId } });
  if (!program) return { results: [], error: "Program not found" };

  const results: BulkResult[] = new Array(rows.length);
  let next = 0;
  // A few requests in parallel, so large files don't hammer the bureau.
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      const parsed = applicantSchema.safeParse(rows[i]);
      const name = String(rows[i]?.name ?? "");
      if (!parsed.success) {
        results[i] = { row: i + 2, name, status: "INVALID", detail: parsed.error.issues.map((e) => e.message).join("; ") };
        continue;
      }
      const outcome = await runEligibilityCheck(program, parsed.data, "BULK");
      results[i] = {
        row: i + 2,
        name: parsed.data.name,
        status: outcome.status,
        detail: outcome.status === "APPROVED" ? `Limit ₹${outcome.approvedLimit.toLocaleString("en-IN")}` : outcome.reasons.join("; "),
      };
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  revalidatePath("/admin", "layout");
  return { results };
}
