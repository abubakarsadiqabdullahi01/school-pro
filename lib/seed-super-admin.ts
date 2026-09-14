import { PrismaClient, Role, CredentialType, Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const accounts = [
  {
    firstName: "Abubakar Sadiq",
    lastName: "Abdullahi",
    email: "superadmin@schoolpro.ng",
    passwordEnv: "SUPER_ADMIN_PASSWORD",
    address: "123 Government Road, Gombe",
  },
  {
    firstName: "Rabiu",
    lastName: "Muhammad",
    email: "admin@schoolpro.ng",
    passwordEnv: "SECOND_SUPER_ADMIN_PASSWORD",
    address: "456 Victoria Island, Gombe",
  },
] as const;

export async function seedSuperAdmin(prisma: PrismaClient) {
  const passwords = accounts.map(({ passwordEnv }) => {
    const password = process.env[passwordEnv];
    if (!password || password.length < 8) {
      throw new Error(`Set ${passwordEnv} to a password of at least 8 characters.`);
    }
    return password;
  });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.credential.findMany({
      where: { value: { in: accounts.map(({ email }) => email) } },
      include: { user: { include: { superAdmin: true } } },
    });
    const byEmail = new Map(existing.map((credential) => [credential.value, credential]));

    // Validate every matching identity before creating either account. A matching
    // email must never silently elevate a different user or overwrite a password.
    for (const { email } of accounts) {
      const credential = byEmail.get(email);
      if (credential && (
        credential.type !== CredentialType.EMAIL ||
        credential.user.role !== Role.SUPER_ADMIN ||
        !credential.user.superAdmin ||
        !credential.user.isActive
      )) {
        throw new Error(`The seed email ${email} belongs to an incompatible account; no changes made.`);
      }
    }

    let created = 0;
    for (const [index, account] of accounts.entries()) {
      if (byEmail.has(account.email)) continue;
      await tx.user.create({ data: {
        firstName: account.firstName,
        lastName: account.lastName,
        role: Role.SUPER_ADMIN,
        gender: Gender.MALE,
        state: "Gombe",
        lga: "Gombe North",
        address: account.address,
        isActive: true,
        superAdmin: { create: {} },
        credentials: { create: {
          type: CredentialType.EMAIL,
          value: account.email,
          passwordHash: await bcrypt.hash(passwords[index], 12),
          isPrimary: true,
        } },
      } });
      created++;
    }
    return { created, existing: accounts.length - created };
  });

  console.log(`Super admin setup complete: ${result.created} created, ${result.existing} already present. Existing passwords were unchanged.`);
  return result;
}
