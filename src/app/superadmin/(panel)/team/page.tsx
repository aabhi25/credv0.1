import { Card, CardHeader } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateUserForm, UserRow } from "../forms";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const me = await requireSuperadmin();
  const users = await db.adminUser.findMany({ where: { role: "SUPERADMIN" }, orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Superadmins</h1>
        <p className="mt-1 text-sm text-slate-500">Your team. Superadmins manage every organization and admin account.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title={`${users.length} superadmin(s)`} />
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === me.id} />
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Add superadmin" subtitle="Full access to all organizations" />
          <div className="p-6">
            <CreateUserForm orgId={null} label="Create superadmin" />
          </div>
        </Card>
      </div>
    </div>
  );
}
