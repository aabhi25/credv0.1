import { cookies } from "next/headers";
import { AppShell, type NavItem } from "@/components/AppShell";
import { requireSuperadmin } from "@/lib/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { logout } from "../../admin/login/actions";

const nav: NavItem[] = [
  { href: "/superadmin", label: "Organizations", icon: "organizations", match: ["/superadmin/organizations"] },
  { href: "/superadmin/team", label: "Superadmins", icon: "superadmins" },
];

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadmin();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell
      nav={nav}
      subtitle="Platform administration"
      badge="Superadmin"
      userLabel={user.email}
      logout={logout}
      defaultCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
