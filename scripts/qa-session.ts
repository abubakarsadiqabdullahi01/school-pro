/**
 * Mints a NextAuth session cookie for a seeded user so authenticated routes can
 * be exercised without submitting anyone's password.
 *
 * Usage:  npx tsx scripts/qa-session.ts SUPER_ADMIN
 *         npx tsx scripts/qa-session.ts ADMIN
 *         npx tsx scripts/qa-session.ts TEACHER
 *
 * Prints the Cookie header value to stdout. Dev only.
 */
import { PrismaClient, Role } from "@prisma/client";
import { encode } from "@auth/core/jwt";

const prisma = new PrismaClient();

const COOKIE_NAME = "authjs.session-token";

async function main() {
  const role = (process.argv[2] ?? "SUPER_ADMIN") as Role;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not set — cannot mint a session.");
  }

  const user = await prisma.user.findFirst({
    where: { role, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true, isActive: true, avatarUrl: true },
  });

  if (!user) throw new Error(`No active ${role} user found.`);

  // Mirror exactly what the jwt callback in auth.config.ts puts on the token.
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl,
      name: `${user.firstName} ${user.lastName}`,
    },
    secret,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });

  console.error(`# ${user.role}: ${user.firstName} ${user.lastName} (${user.id})`);
  console.log(`${COOKIE_NAME}=${token}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("FAILED:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
