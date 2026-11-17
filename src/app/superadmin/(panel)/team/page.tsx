import { Card, CardHeader, PageIntro } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddUserButton, UserRow } from "../forms";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const me = await requireSuperadmin();
  const users = await db.adminUser.findMany({ where: { role: "SUPERADMIN" }, orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <PageIntro>Your team. Superadmins manage every organization and admin account.</PageIntro>
      <Card className="overflow-hidden">
        <CardHeader
          title={`${users.length} superadmin(s)`}
          subtitle="Full access to all organizations"
          action={
            <AddUserButton
              orgId={null}
              label="Add superadmin"
              title="Add a superadmin"
              description="They'll have full access to every organization."
            />
          }
        />
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === me.id} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
