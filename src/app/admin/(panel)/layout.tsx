import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../login/actions";
import { NavLinks } from "./NavLinks";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-navy-900 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-navy-200 sm:inline">{admin.email}</span>
            <form action={logout}>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-100 hover:bg-white/10">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
        <NavLinks />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
