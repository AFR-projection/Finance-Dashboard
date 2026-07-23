import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@ledgerly.local";
  const passwordHash = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo User",
      passwordHash,
      settings: { create: {} },
    },
  });

  const categories = [
    { name: "Food", icon: "utensils", color: "#0F766E", type: "EXPENSE" as const },
    { name: "Transport", icon: "car", color: "#0369A1", type: "EXPENSE" as const },
    { name: "Salary", icon: "wallet", color: "#15803D", type: "INCOME" as const },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: {
        userId_name_type: { userId: user.id, name: c.name, type: c.type },
      },
      update: {},
      create: { ...c, userId: user.id, isDefault: true },
    });
  }

  console.log("Seeded demo user:", email, "/ demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
