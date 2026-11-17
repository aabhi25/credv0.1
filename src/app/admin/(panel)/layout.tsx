import { cookies } from "next/headers";
import { AppShell, type NavSection } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { exitOrganizationView } from "../../superadmin/view-as";
import { logout } from "../login/actions";

const sections: NavSection[] = [
  { title: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: "dashboard", color: "navy" }] },
  {
    title: "Eligibility",
    items: [
      { href: "/admin/programs", label: "Programs", icon: "programs", color: "violet" },
      { href: "/admin/applicants", label: "Applicants", icon: "applicants", color: "emerald" },
    ],
  },
  { title: "Settings", items: [{ href: "/admin/bureaus", label: "Bureaus", icon: "bureaus", color: "sky" }] },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell
      sections={sections}
      home="/admin"
      subtitle={admin.organization.name}
      userLabel={admin.email}
      logout={logout}
      defaultCollapsed={collapsed}
      viewingAs={admin.viewingAsSuperadmin ? { organization: admin.organization.name, exit: exitOrganizationView } : undefined}
    >
      {children}
    </AppShell>
  );
}
