import { PrismaClient, Role, CredentialType, Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (dev use only)
  await prisma.loginSession.deleteMany({});
  await prisma.loginAttempt.deleteMany({});
  await prisma.credential.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.teacher.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.admin.deleteMany({});
  await prisma.superAdmin.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.school.deleteMany({});

  console.log("✅ Cleared existing data");

  // Step 1: Create School
  const school = await prisma.school.create({
    data: {
      name: "Greenfield International School",
      code: "GFIS001",
      address: "123 Main Street, Lagos",
      phone: "+2348000000000",
      email: "info@greenfield.edu.ng",
      website: "https://greenfield.edu.ng",
      logoUrl: "https://via.placeholder.com/150",
    },
  });

  console.log("🏫 School created:", school.name);

  // Step 2: SuperAdmin
  const superAdminUser = await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      role: Role.SUPER_ADMIN,
      isActive: true,
      gender: Gender.MALE,
      state: "Lagos",
      lga: "Ikeja",
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
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: true,
    },
  });

  console.log("🛡️ SuperAdmin seeded");

  // Step 3: Admin
  const adminUser = await prisma.user.create({
    data: {
      firstName: "Admin",
      lastName: "User",
      role: Role.ADMIN,
      isActive: true,
      gender: Gender.OTHER,
      state: "Lagos",
      lga: "Yaba",
      address: "12 Admin Close",
      admin: {
        create: {
          schoolId: school.id,
          permissions: "all",
        },
      },
    },
  });

  await prisma.credential.create({
    data: {
      userId: adminUser.id,
      type: CredentialType.EMAIL,
      value: "admin@school.com",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: true,
    },
  });

  console.log("👨‍💼 Admin seeded");

  // Step 4: Teacher
  const teacherUser = await prisma.user.create({
    data: {
      firstName: "Teacher",
      lastName: "Smith",
      role: Role.TEACHER,
      isActive: true,
      gender: Gender.FEMALE,
      state: "Abuja",
      lga: "Garki",
      address: "22 Education Drive",
      teacher: {
        create: {
          schoolId: school.id,
          staffId: "TCH001",
        },
      },
    },
  });

  await prisma.credential.create({
    data: {
      userId: teacherUser.id,
      type: CredentialType.EMAIL,
      value: "teacher@school.com",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: true,
    },
  });

  console.log("👨‍🏫 Teacher seeded");

  // Step 5: Student
  const studentUser = await prisma.user.create({
    data: {
      firstName: "Student",
      lastName: "Johnson",
      role: Role.STUDENT,
      isActive: true,
      gender: Gender.FEMALE,
      state: "Oyo",
      lga: "Ibadan North",
      address: "45 School Lane",
      student: {
        create: {
          schoolId: school.id,
          admissionNo: "STU001",
          year: 2024,
        },
      },
    },
  });

  await prisma.credential.create({
    data: {
      userId: studentUser.id,
      type: CredentialType.EMAIL,
      value: "student@school.com",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: true,
    },
  });

  await prisma.credential.create({
    data: {
      userId: studentUser.id,
      type: CredentialType.REGISTRATION_NUMBER,
      value: "STU12345",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: false,
    },
  });

  console.log("👨‍🎓 Student seeded");

  // Step 6: Parent
  const parentUser = await prisma.user.create({
    data: {
      firstName: "Parent",
      lastName: "Brown",
      role: Role.PARENT,
      isActive: true,
      gender: Gender.MALE,
      state: "Kaduna",
      lga: "Chikun",
      address: "5 Family Street",
      parent: {
        create: {
          schoolId: school.id,
        },
      },
    },
  });

  await prisma.credential.create({
    data: {
      userId: parentUser.id,
      type: CredentialType.EMAIL,
      value: "parent@school.com",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: true,
    },
  });

  await prisma.credential.create({
    data: {
      userId: parentUser.id,
      type: CredentialType.PHONE,
      value: "+1234567890",
      passwordHash: await bcrypt.hash("password123", 10),
      isPrimary: false,
    },
  });

  console.log("👨‍👧 Parent seeded");

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
