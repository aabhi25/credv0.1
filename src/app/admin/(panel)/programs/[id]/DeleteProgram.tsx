"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { deleteProgram } from "../actions";

export function DeleteProgram({ id, name, checks }: { id: string; name: string; checks: number }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: `Delete "${name}"?`,
          message: (
            <>
              This also deletes its {checks} eligibility check record(s) and can&apos;t be undone. To stop new checks only,
              untick &ldquo;Link is active&rdquo; instead.
            </>
          ),
          confirmLabel: "Delete program",
          tone: "danger",
        });
        if (ok) startTransition(() => deleteProgram(id));
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete program"}
    </button>
  );
}
