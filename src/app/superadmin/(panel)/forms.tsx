"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Check, KeyRound, Pencil, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { ActiveBadge, Button, Field, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  createOrganization,
  createUser,
  renameOrganization,
  setOrganizationActive,
  setUserActive,
  updateUser,
  type FormState,
} from "../actions";

/** Submits without React's automatic form reset, so typed values survive validation errors. */
function useSubmit(action: (fd: FormData) => void) {
  const [, startTransition] = useTransition();
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function PasswordInput({ name, error, optional = false }: { name: string; error?: string; optional?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <Field
      label={optional ? "New password (optional)" : "Password"}
      error={error}
      hint={optional ? "Leave blank to keep the current password" : "At least 8 characters. Share it securely."}
    >
      <div className="flex gap-2">
        <input
          name={name}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
        <button
          type="button"
          onClick={() => setValue(generatePassword())}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-navy-900 hover:bg-slate-50"
        >
          <KeyRound className="h-3.5 w-3.5" /> Generate
        </button>
      </div>
    </Field>
  );
}

function Notice({ state }: { state: FormState }) {
  if (!state.ok) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
      <Check className="h-4 w-4" /> {state.ok}
    </span>
  );
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  const onSubmit = useSubmit(action);
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Organization name" error={e.orgName} hint="e.g. the NBFC's legal or brand name">
        <input name="orgName" className={inputClass} />
      </Field>
      <div className="border-t border-slate-100 pt-5">
        <p className="mb-4 text-sm font-semibold text-navy-900">First admin account</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Admin name" error={e.adminName}>
            <input name="adminName" className={inputClass} />
          </Field>
          <Field label="Admin email or username" error={e.adminEmail}>
            <input name="adminEmail" type="text" className={inputClass} />
          </Field>
        </div>
        <div className="mt-4">
          <PasswordInput name="adminPassword" error={e.adminPassword} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}

export function RenameOrganizationForm({ orgId, name }: { orgId: string; name: string }) {
  const [state, action, pending] = useActionState(renameOrganization.bind(null, orgId), {});
  const onSubmit = useSubmit(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <Field label="Organization name" error={state.errors?.orgName}>
          <input name="orgName" defaultValue={name} className={inputClass} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

export function OrganizationStatusButton({ orgId, active, name }: { orgId: string; active: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  return (
    <Button
      variant={active ? "secondary" : "primary"}
      disabled={pending}
      className={active ? "text-rose-700" : ""}
      onClick={async () => {
        const ok = await confirm(
          active
            ? {
                title: `Disable ${name}?`,
                message: "Its admins will be signed out and all its eligibility links will stop working until you enable it again.",
                confirmLabel: "Disable organization",
                tone: "danger",
              }
            : {
                title: `Enable ${name}?`,
                message: "Its admins can sign in again and its active eligibility links will work.",
                confirmLabel: "Enable organization",
              },
        );
        if (ok) startTransition(() => setOrganizationActive(orgId, !active));
      }}
    >
      {pending ? "Updating…" : active ? "Disable organization" : "Enable organization"}
    </Button>
  );
}

export function CreateUserForm({ orgId, label }: { orgId: string | null; label: string }) {
  const [state, action, pending] = useActionState(createUser.bind(null, orgId), {});
  const onSubmit = useSubmit(action);
  const [formKey, setFormKey] = useState(0);
  const e = state.errors ?? {};
  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={e.name}>
          <input name="name" className={inputClass} />
        </Field>
        <Field label="Email or username" error={e.email}>
          <input name="email" type="text" className={inputClass} />
        </Field>
      </div>
      <PasswordInput name="password" error={e.password} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : label}
        </Button>
        {state.ok && (
          <>
            <Notice state={state} />
            <button type="button" onClick={() => setFormKey((k) => k + 1)} className="text-sm text-navy-700 hover:underline">
              Clear form
            </button>
          </>
        )}
      </div>
    </form>
  );
}

type UserRowData = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export function UserRow({ user, isSelf = false }: { user: UserRowData; isSelf?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateUser.bind(null, user.id), {});
  const onSubmit = useSubmit(action);
  const [statusPending, startTransition] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  const confirm = useConfirm();
  const e = state.errors ?? {};

  const toggle = async () => {
    const ok = await confirm(
      user.active
        ? {
            title: `Disable ${user.name}?`,
            message: `${user.email} will be signed out and can't sign in until you enable the account again.`,
            confirmLabel: "Disable account",
            tone: "danger",
          }
        : {
            title: `Enable ${user.name}?`,
            message: `${user.email} will be able to sign in again.`,
            confirmLabel: "Enable account",
          },
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await setUserActive(user.id, !user.active);
      setStatusError(res.error ?? null);
    });
  };

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{user.name}</span>
            {isSelf && <span className="text-xs text-slate-400">(you)</span>}
            <ActiveBadge active={user.active} on="Active" off="Disabled" />
          </div>
          <div className="text-sm text-slate-500">{user.email}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {user.lastLoginAt ? `Last sign-in ${formatDateTime(user.lastLoginAt)}` : "Never signed in"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-900 hover:bg-slate-50"
          >
            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editing ? "Close" : "Edit"}
          </button>
          {!isSelf && (
            <button
              type="button"
              onClick={toggle}
              disabled={statusPending}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                user.active ? "text-rose-700 hover:bg-rose-50" : "bg-navy-900 text-white hover:bg-navy-800"
              }`}
            >
              {statusPending ? "Updating…" : user.active ? "Disable" : "Enable"}
            </button>
          )}
        </div>
      </div>
      {statusError && <p className="mt-2 text-sm text-rose-600">{statusError}</p>}
      {editing && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={e.name}>
              <input name="name" defaultValue={user.name} className={inputClass} />
            </Field>
            <Field label="Email or username" error={e.email}>
              <input name="email" type="text" defaultValue={user.email} className={inputClass} />
            </Field>
          </div>
          <PasswordInput name="password" error={e.password} optional />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Notice state={state} />
          </div>
        </form>
      )}
    </li>
  );
}
