import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { requireSuperadmin } from "@/lib/auth";
import { logout } from "../../admin/login/actions";
import { SuperNavLinks } from "./SuperNavLinks";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-navy-950 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo subtitle="Platform administration" />
            <span className="rounded-md bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-400 ring-1 ring-gold-400/30">
              Superadmin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-navy-200 sm:inline">{user.email}</span>
            <form action={logout}>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-100 hover:bg-white/10">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
        <SuperNavLinks />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
