import { cookies } from "next/headers";
import { AppShell, type NavItem } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { logout } from "../login/actions";

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/programs", label: "Programs", icon: "programs" },
  { href: "/admin/applicants", label: "Applicants", icon: "applicants" },
  { href: "/admin/bureaus", label: "Bureaus", icon: "bureaus" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell nav={nav} subtitle={admin.organization.name} userLabel={admin.email} logout={logout} defaultCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
