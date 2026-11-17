import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  const superEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase();
  const superPassword = process.env.SUPERADMIN_PASSWORD;
  if (!superEmail || !superPassword) throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env");

  await db.adminUser.upsert({
    where: { email: superEmail },
    update: {},
    create: { email: superEmail, name: "Super Admin", role: "SUPERADMIN", passwordHash: await hashPassword(superPassword) },
  });

  // Optional demo organization with its own admin and sample programs.
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log(`Seeded superadmin ${superEmail}`);
    return;
  }

  const existing = await db.adminUser.findUnique({ where: { email: adminEmail } });
  const org =
    (existing?.organizationId && (await db.organization.findUnique({ where: { id: existing.organizationId } }))) ||
    (await db.organization.create({ data: { name: "Demo NBFC" } }));

  if (!existing) {
    await db.adminUser.create({
      data: {
        email: adminEmail,
        name: "Demo Admin",
        role: "ADMIN",
        organizationId: org.id,
        passwordHash: await hashPassword(adminPassword),
      },
    });
  }

  for (const bureau of ["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"]) {
    await db.bureauSetting.upsert({
      where: { organizationId_bureau: { organizationId: org.id, bureau } },
      update: {},
      create: { organizationId: org.id, bureau, enabled: true },
    });
  }

  const programs = [
    {
      name: "Education Loans",
      slug: "education",
      category: "Education",
      description: "Course fee financing for students and parents.",
      bureau: "CIBIL",
      minScore: 700,
      maxDtiPct: 35,
      maxDefaults: 0,
      minAge: 18,
      maxAge: 55,
      approvedLimit: 300000,
    },
    {
      name: "Consumer Brands EMI",
      slug: "consumer-brands",
      category: "Consumer Brands",
      description: "Instant EMI for electronics and lifestyle purchases.",
      bureau: "EQUIFAX",
      minScore: 650,
      maxDtiPct: 45,
      maxDefaults: 1,
      minAge: 21,
      maxAge: 60,
      approvedLimit: 50000,
    },
  ];
  for (const p of programs) {
    await db.program.upsert({ where: { slug: p.slug }, update: {}, create: { ...p, organizationId: org.id } });
  }

  console.log(`Seeded superadmin ${superEmail} and "${org.name}" with admin ${adminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
