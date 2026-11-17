"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { ActiveBadge, BureauStatusBadge, Button, Field, inputClass } from "@/components/ui";
import { CREDENTIAL_FIELDS, type BureauCode, type BureauStatus } from "@/lib/bureaus/types";
import { formatDateTime } from "@/lib/format";
import {
  createOrganization,
  createUser,
  removeBureauCredentials,
  renameOrganization,
  saveBureauCredentials,
  setOrganizationActive,
  setOrganizationBureau,
  setUserActive,
  updateUser,
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

/** "Rename" button that opens a popup with the organization name. */
export function RenameOrganizationButton({ orgId, name }: { orgId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Rename
      </Button>
      {open && (
        <Modal title="Rename organization" onClose={() => setOpen(false)} size="sm">
          <RenameOrganizationForm orgId={orgId} name={name} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function RenameOrganizationForm({ orgId, name, onDone }: { orgId: string; name: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(renameOrganization.bind(null, orgId), {});
  const onSubmit = useSubmit(action);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Organization name" error={state.errors?.orgName}>
        <input name="orgName" defaultValue={name} className={inputClass} />
      </Field>
      <ModalActions onCancel={onDone} pending={pending} label="Save name" />
    </form>
  );
}

function ModalActions({ onCancel, pending, label }: { onCancel: () => void; pending: boolean; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
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

/** "Add admin" / "Add superadmin" button that opens the new-account form in a popup. */
export function AddUserButton({
  orgId,
  label,
  title,
  description,
}: {
  orgId: string | null;
  label: string;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="py-1.5">
        <UserPlus className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <Modal title={title} description={description} onClose={() => setOpen(false)}>
          <CreateUserForm orgId={orgId} label={`Create ${label.replace(/^Add /, "")}`} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function CreateUserForm({ orgId, label, onDone }: { orgId: string | null; label: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(createUser.bind(null, orgId), {});
  const onSubmit = useSubmit(action);
  const e = state.errors ?? {};
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={e.name}>
          <input name="name" className={inputClass} />
        </Field>
        <Field label="Email or username" error={e.email}>
          <input name="email" type="text" autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <PasswordInput name="password" error={e.password} />
      <ModalActions onCancel={onDone} pending={pending} label={label} />
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function UserRow({ user, isSelf = false }: { user: UserRowData; isSelf?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [statusPending, startTransition] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  const confirm = useConfirm();

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            user.active ? "bg-navy-50 text-navy-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          {initials(user.name) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{user.name}</span>
            {isSelf && <span className="text-xs text-slate-400">(you)</span>}
            <ActiveBadge active={user.active} on="Active" off="Disabled" />
          </div>
          <div className="truncate text-xs text-slate-500">
            {user.email} · {user.lastLoginAt ? `last sign-in ${formatDateTime(user.lastLoginAt)}` : "never signed in"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          {!isSelf && (
            <button
              type="button"
              onClick={toggle}
              disabled={statusPending}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
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
        <Modal title={`Edit ${user.name}`} description="Change the name, sign-in ID or password." onClose={() => setEditing(false)}>
          <EditUserForm user={user} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </li>
  );
}

function EditUserForm({ user, onDone }: { user: UserRowData; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateUser.bind(null, user.id), {});
  const onSubmit = useSubmit(action);
  const e = state.errors ?? {};
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={e.name}>
          <input name="name" defaultValue={user.name} className={inputClass} />
        </Field>
        <Field label="Email or username" error={e.email}>
          <input name="email" type="text" defaultValue={user.email} autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <PasswordInput name="password" error={e.password} optional />
      <p className="text-xs text-slate-500">Changing the password signs this person out of every device.</p>
      <ModalActions onCancel={onDone} pending={pending} label="Save changes" />
    </form>
  );
}

type OrgBureau = {
  code: string;
  label: string;
  enabled: boolean;
  status: BureauStatus;
  programs: number;
  integrated: boolean;
  credential: { hint: string; endpointUrl: string; updatedAt: Date } | null;
};

/** Superadmin switches for which credit bureaus an organization may use, plus its API credentials. */
export function OrganizationBureaus({ orgId, orgName, bureaus }: { orgId: string; orgName: string; bureaus: OrgBureau[] }) {
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  const toggle = async (b: OrgBureau) => {
    if (b.enabled && b.programs > 0) {
      const ok = await confirm({
        title: `Disable ${b.label} for ${orgName}?`,
        message: `${b.programs} program(s) use it. Their eligibility links will show "Not available yet" and no checks will run until you enable it again.`,
        confirmLabel: "Disable bureau",
        tone: "danger",
      });
      if (!ok) return;
    }
    setPendingCode(b.code);
    startTransition(async () => {
      await setOrganizationBureau(orgId, b.code, !b.enabled);
      setPendingCode(null);
    });
  };

  const remove = async (b: OrgBureau) => {
    const ok = await confirm({
      title: `Remove ${b.label} credentials?`,
      message: `${orgName}'s programs on ${b.label} will stop running checks until new credentials are saved.`,
      confirmLabel: "Remove credentials",
      tone: "danger",
    });
    if (!ok) return;
    setPendingCode(b.code);
    startTransition(async () => {
      await removeBureauCredentials(orgId, b.code);
      setPendingCode(null);
      setEditing(null);
    });
  };

  return (
    <ul className="divide-y divide-slate-100">
      {bureaus.map((b) => (
        <li key={b.code} className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{b.label}</span>
                <BureauStatusBadge status={b.status} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {b.enabled ? "Visible to this organization" : "Hidden from this organization"} · used by {b.programs} program(s)
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={b.enabled}
              aria-label={`${b.enabled ? "Disable" : "Enable"} ${b.label} for ${orgName}`}
              disabled={pendingCode === b.code}
              onClick={() => toggle(b)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${b.enabled ? "bg-navy-900" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${b.enabled ? "left-[22px]" : "left-0.5"}`}
              />
            </button>
          </div>

          {b.integrated && (
            <div className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-600">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {b.credential ? (
                    <span className="truncate">
                      API credentials saved · {b.credential.hint} · {new URL(b.credential.endpointUrl).host} · updated{" "}
                      {formatDateTime(b.credential.updatedAt)}
                    </span>
                  ) : (
                    <span>No API credentials yet. Checks can&apos;t run until they&apos;re added.</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === b.code ? null : b.code)}
                    className="rounded-md px-2 py-1 font-medium text-navy-700 hover:bg-white"
                  >
                    {editing === b.code ? "Close" : b.credential ? "Update" : "Add credentials"}
                  </button>
                  {b.credential && (
                    <button
                      type="button"
                      onClick={() => remove(b)}
                      disabled={pendingCode === b.code}
                      className="rounded-md px-2 py-1 font-medium text-rose-700 hover:bg-white disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {editing === b.code && (
                <BureauCredentialsForm orgId={orgId} bureau={b.code as BureauCode} existing={b.credential} onSaved={() => setEditing(null)} />
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function BureauCredentialsForm({
  orgId,
  bureau,
  existing,
  onSaved,
}: {
  orgId: string;
  bureau: BureauCode;
  existing: OrgBureau["credential"];
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(saveBureauCredentials.bind(null, orgId, bureau), {});
  const onSubmit = useSubmit(action);
  const fields = CREDENTIAL_FIELDS[bureau] ?? [];
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state, onSaved]);

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-slate-200 pt-3" autoComplete="off">
      <p className="text-xs text-slate-500">
        Use the credentials Equifax issued to this organization. They&apos;re stored encrypted and never shown again.
        {existing && " Leave a field blank to keep its saved value."}
      </p>
      <Field label="API address" error={e.endpointUrl} hint="The test (UAT) or production URL from the bureau">
        <input name="endpointUrl" defaultValue={existing?.endpointUrl} placeholder="https://" className={`${inputClass} font-mono`} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} error={e[f.key]}>
            <input
              name={f.key}
              type={f.secret ? "password" : "text"}
              maxLength={f.maxLength}
              placeholder={existing ? (f.secret ? "•••••• (saved)" : "Saved; leave blank to keep") : ""}
              autoComplete={f.secret ? "new-password" : "off"}
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </Field>
        ))}
      </div>
      {e.form && <p className="text-xs text-rose-600">{e.form}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : existing ? "Update credentials" : "Save credentials"}
      </Button>
    </form>
  );
}
