import { PrismaClient, Role, CredentialType, Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {


  // Step 1: Create School
  const school = await prisma.school.create({
    data: {
      name: "Gombe International School",
      code: "GIS 178",
      address: "123 Main Street, Gombe near Government House",
      phone: "+2348000000000",
      email: "info@gis.edu.ng",
      website: "https://gis.edu.ng",
      logoUrl: "",
      admissionPrefix: "GIS", // Explicitly set
      admissionSequenceStart: 1, // Explicitly set
    },
  });

  console.log("🏫 School created:", school.name);

  // Step 2: SuperAdmin
  const superAdminUser = await prisma.user.create({
    data: {
      firstName: "Abubakar Sadiq",
      lastName: "Abdullahi",
      role: Role.SUPER_ADMIN,
      isActive: true,
      gender: Gender.MALE,
      state: "Gombe",
      lga: "Gombe North",
      address: "123 Government Road",
      superAdmin: {
        create: {},
      },
    },
  });

  await prisma.credential.create({
    data: {
      userId: superAdminUser.id,
      type: CredentialType.EMAIL,
      value: "superadmin@school.com",
      passwordHash: await bcrypt.hash("@HumSad01", 10),
      isPrimary: true,
    },
  });

  console.log("✅ Seed data created successfully");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });