"use client";

import { useActionState } from "react";
import { APP_NAME, Logo } from "@/components/Logo";
import { Button, Field, inputClass } from "@/components/ui";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-12 lg:flex">
        <Logo />
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Pre-approved credit,
            <br />
            configured your way.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-navy-200">
            Run separate rule engines for every partner, connect any bureau and share a link that decides in seconds.
          </p>
        </div>
        <p className="text-xs text-navy-300">© {APP_NAME}</p>
      </div>
      <div className="flex items-center justify-center px-6">
        <form action={action} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-navy-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">For organization admins and platform superadmins.</p>
          </div>
          {state.error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{state.error}</div>
          )}
          <Field label="Email or username">
            <input name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required className={inputClass} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </Field>
          <Button type="submit" disabled={pending} className="w-full py-3">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
