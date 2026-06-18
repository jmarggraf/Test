/**
 * Seed script: creates the initial admin user.
 *
 * Credentials are taken from environment variables so they can be overridden;
 * the defaults are for local development only — never use them in production.
 *
 * Run: npm run db:seed
 */
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@ferienhaus.local";
  const name = process.env.ADMIN_NAME ?? "Admin";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role: Role.ADMIN,
      passwordHash,
      mustChangePassword: false,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`[seed] Admin user ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
