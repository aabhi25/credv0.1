import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");

  await db.adminUser.upsert({
    where: { email },
    update: {},
    create: { email, name: "Admin", passwordHash: await hashPassword(password) },
  });

  for (const bureau of ["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"]) {
    await db.bureauSetting.upsert({ where: { bureau }, update: {}, create: { bureau } });
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
    await db.program.upsert({ where: { slug: p.slug }, update: {}, create: p });
  }

  console.log(`Seeded admin ${email}, 4 bureaus and ${programs.length} programs`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
