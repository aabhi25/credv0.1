"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { Button, StatusBadge } from "@/components/ui";
import { runBulkCheck, type BulkResult, type BulkRow } from "../actions";

const REQUIRED = ["name", "mobile", "pan", "dob"] as const;

export function BulkUpload({ programId }: { programId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = (file: File) => {
    setError(null);
    setResults(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (parsed) => {
        const missing = REQUIRED.filter((c) => !parsed.meta.fields?.includes(c));
        if (missing.length) {
          setRows([]);
          setError(`Missing column(s): ${missing.join(", ")}`);
          return;
        }
        setRows(parsed.data.map((r) => ({ name: r.name ?? "", mobile: r.mobile ?? "", pan: r.pan ?? "", dob: r.dob ?? "" })));
      },
      error: (err) => setError(err.message),
    });
  };

  const run = () =>
    startTransition(async () => {
      const res = await runBulkCheck(programId, rows);
      if (res.error) setError(res.error);
      else setResults(res.results);
    });

  const summary = results && {
    approved: results.filter((r) => r.status === "APPROVED").length,
    declined: results.filter((r) => r.status === "DECLINED").length,
    failed: results.filter((r) => r.status === "ERROR" || r.status === "INVALID").length,
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) load(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-navy-500 bg-navy-50" : "border-slate-300 hover:border-navy-300 hover:bg-slate-50"
        }`}
      >
        {fileName ? <FileSpreadsheet className="h-8 w-8 text-navy-700" /> : <UploadCloud className="h-8 w-8 text-navy-500" />}
        <p className="mt-3 text-sm font-medium text-slate-800">
          {fileName ? `${fileName} · ${rows.length} row(s)` : "Drop a CSV here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-slate-500">Columns: name, mobile, pan, dob (YYYY-MM-DD or DD/MM/YYYY) · max 500 rows</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) load(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}

      <Button onClick={run} disabled={pending || rows.length === 0} className="w-full">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Checking {rows.length} applicant(s)…
          </>
        ) : (
          `Run bulk check (${rows.length})`
        )}
      </Button>

      {results && summary && (
        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap gap-4 border-b border-slate-100 px-4 py-3 text-sm">
            <span className="font-medium text-emerald-700">{summary.approved} eligible</span>
            <span className="font-medium text-rose-700">{summary.declined} not eligible</span>
            <span className="font-medium text-amber-700">{summary.failed} failed</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.row}>
                    <td className="w-14 px-4 py-2 text-xs text-slate-400">#{r.row}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.name || "—"}</td>
                    <td className="px-4 py-2">
                      {r.status === "INVALID" ? (
                        <span className="text-xs font-semibold text-amber-700">Invalid row</span>
                      ) : (
                        <StatusBadge status={r.status} />
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
