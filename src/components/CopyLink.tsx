"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export function CopyLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:text-navy-900"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">{url}</span>
      <a href={url} target="_blank" rel="noreferrer" className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-navy-900" title="Open">
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
