import { cookies } from "next/headers";
import { AppShell, type NavSection } from "@/components/AppShell";
import { requireSuperadmin } from "@/lib/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { logout } from "../../admin/login/actions";

const sections: NavSection[] = [
  {
    title: "Customers",
    items: [
      { href: "/superadmin", label: "Organizations", icon: "organizations", color: "violet", match: ["/superadmin/organizations"] },
    ],
  },
  { title: "Platform", items: [{ href: "/superadmin/team", label: "Superadmins", icon: "superadmins", color: "navy" }] },
];

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadmin();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell
      sections={sections}
      home="/superadmin"
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
