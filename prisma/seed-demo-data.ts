// scripts/seed-demo-data.ts
import { PrismaClient, Role, CredentialType, Gender, ClassLevel, PaymentStatus, TransitionType, EnrollmentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ["error"],
});

// Configuration for scalability
const CONFIG = {
  TEACHER_COUNT: 5,
  STUDENT_COUNT: 25,
  PARENT_COUNT: 10,
  PAYMENT_COUNT: 15,
  SUBJECTS_PER_CLASS: 5,
  BATCH_SIZE: 10,

  MAX_SUBJECTS_PER_TEACHER: 3,
  MAX_CLASSES_PER_TEACHER: 2,
  MAX_STUDENTS_PER_PARENT: 3,
};



// Nigerian states and sample LGAs
const NIGERIAN_STATES = [
  { name: "Abia", capital: "Umuahia", region: "South East" },
  { name: "Adamawa", capital: "Yola", region: "North East" },
  { name: "Akwa Ibom", capital: "Uyo", region: "South South" },
  { name: "Anambra", capital: "Awka", region: "South East" },
  { name: "Bauchi", capital: "Bauchi", region: "North East" },
  { name: "Bayelsa", capital: "Yenagoa", region: "South South" },
  { name: "Benue", capital: "Makurdi", region: "North Central" },
  { name: "Borno", capital: "Maiduguri", region: "North East" },
  { name: "Cross River", capital: "Calabar", region: "South South" },
  { name: "Delta", capital: "Asaba", region: "South South" },
  { name: "Ebonyi", capital: "Abakaliki", region: "South East" },
  { name: "Edo", capital: "Benin City", region: "South South" },
  { name: "Ekiti", capital: "Ado-Ekiti", region: "South West" },
  { name: "Enugu", capital: "Enugu", region: "South East" },
  { name: "FCT", capital: "Abuja", region: "North Central" },
  { name: "Gombe", capital: "Gombe", region: "North East" },
  { name: "Imo", capital: "Owerri", region: "South East" },
  { name: "Jigawa", capital: "Dutse", region: "North West" },
  { name: "Kaduna", capital: "Kaduna", region: "North West" },
  { name: "Kano", capital: "Kano", region: "North West" },
  { name: "Katsina", capital: "Katsina", region: "North West" },
  { name: "Kebbi", capital: "Birnin Kebbi", region: "North West" },
  { name: "Kogi", capital: "Lokoja", region: "North Central" },
  { name: "Kwara", capital: "Ilorin", region: "North Central" },
  { name: "Lagos", capital: "Ikeja", region: "South West" },
  { name: "Nasarawa", capital: "Lafia", region: "North Central" },
  { name: "Niger", capital: "Minna", region: "North Central" },
  { name: "Ogun", capital: "Abeokuta", region: "South West" },
  { name: "Ondo", capital: "Akure", region: "South West" },
  { name: "Osun", capital: "Oshogbo", region: "South West" },
  { name: "Oyo", capital: "Ibadan", region: "South West" },
  { name: "Plateau", capital: "Jos", region: "North Central" },
  { name: "Rivers", capital: "Port Harcourt", region: "South South" },
  { name: "Sokoto", capital: "Sokoto", region: "North West" },
  { name: "Taraba", capital: "Jalingo", region: "North East" },
  { name: "Yobe", capital: "Damaturu", region: "North East" },
  { name: "Zamfara", capital: "Gusau", region: "North West" }
];

// Nigerian subjects by class level
const SUBJECTS_BY_LEVEL = {
  PRIMARY: [
    "English Studies", "Mathematics", "Basic Science", "Basic Technology",
    "Social Studies", "Cultural & Creative Arts", "Christian Religious Studies",
    "Islamic Religious Studies", "Hausa Language", "Yoruba Language", "Igbo Language",
    "French Language", "Physical & Health Education", "Computer Studies"
  ],
  JSS: [
    "English Language", "Mathematics", "Basic Science", "Basic Technology",
    "Social Studies", "Business Studies", "French Language", "Nigerian Languages",
    "Christian Religious Studies", "Islamic Religious Studies", "Cultural & Creative Arts",
    "Physical & Health Education", "Computer Studies", "Agricultural Science", "Home Economics"
  ],
  SSS: [
    "English Language", "Mathematics", "Biology", "Chemistry", "Physics",
    "Further Mathematics", "Agricultural Science", "Economics", "Commerce",
    "Accounting", "Government", "Geography", "Literature in English",
    "Christian Religious Studies", "Islamic Religious Studies", "Hausa Language",
    "Yoruba Language", "Igbo Language", "French Language", "Technical Drawing",
    "Food and Nutrition", "Computer Studies", "Physical Education"
  ]
};

// Precompute helper data
const DEPARTMENTS = [
  "Mathematics", "Sciences", "Languages", "Social Sciences",
  "Arts", "Vocational", "Physical Education", "ICT"
];

const QUALIFICATIONS = [
  "B.Sc Education", "B.Ed", "M.Ed", "Ph.D Education",
  "B.A Education", "PGDE", "NCE", "B.Tech Education"
];

const OCCUPATIONS = [
  "Civil Servant", "Banker", "Engineer", "Doctor", "Lawyer",
  "Business Owner", "Teacher", "Nurse", "Accountant", "Architect",
  "Pharmacist", "Entrepreneur", "Civil Engineer", "Software Developer"
];

const FEE_TYPES = ["Tuition", "Development", "PTA", "Sports", "ICT", "Laboratory"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "POS", "Online"];

async function main() {
  console.log("🌱 Starting seed data creation...");

  // Clean existing data (be careful in production!)
  if (process.env.NODE_ENV !== 'production') {
    console.log("🧹 Cleaning existing data...");
    
    // Use individual delete operations instead of TRUNCATE CASCADE
    // This is safer and respects Prisma relations
    await prisma.assessment.deleteMany();
    await prisma.studentParent.deleteMany();
    await prisma.studentClassTerm.deleteMany();
    await prisma.teacherClassTerm.deleteMany();
    await prisma.teacherSubject.deleteMany();
    await prisma.classSubject.deleteMany();
    await prisma.classTerm.deleteMany();

    await prisma.student.deleteMany();
    await prisma.teacher.deleteMany();
    await prisma.parent.deleteMany();
    await prisma.admin.deleteMany();

    await prisma.term.deleteMany();
    await prisma.session.deleteMany();
    await prisma.class.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.feeStructure.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.gradingSystem.deleteMany();

    await prisma.credential.deleteMany();
    await prisma.user.deleteMany();
    await prisma.school.deleteMany();

  }

  // Step 1: Create Super Admins
  console.log("👑 Creating Super Admins...");
  
  const superAdminData = [
    {
      firstName: "Abubakar Sadiq",
      lastName: "Abdullahi",
      role: Role.SUPER_ADMIN,
      gender: Gender.MALE,
      state: "Gombe",
      lga: "Gombe North",
      address: "123 Government Road, Gombe",
      email: "superadmin@schoolpro.ng",
      password: "@HumSad01"
    },
    {
      firstName: "Rabiu",
      lastName: "Muhammad",
      role: Role.SUPER_ADMIN,
      gender: Gender.MALE,
      state: "Gombe",
      lga: "Gombe North",
      address: "456 Victoria Island, Gombe",
      email: "admin@schoolpro.ng",
      password: "admin123"
    }
  ];

  const superAdmins = await Promise.all(
    superAdminData.map(data => createUserWithCredential(data))
  );

  // Step 2: Create School
  console.log("🏫 Creating School...");
  const school = await prisma.school.create({
    data: {
      name: "Excel College Abuja",
      code: "EXC-ABJ",
      address: "Plot 123, Central Business District, Abuja",
      phone: "+2348030000000",
      email: "info@excelcollegeabj.edu.ng",
      website: "https://excelcollegeabj.edu.ng",
      logoUrl: "",
      admissionPrefix: "EXC",
      admissionSequenceStart: 1001,
    },
  });

  // Step 3: Create Admin for the school
  console.log("👨‍💼 Creating School Admin...");
  const schoolAdmin = await createUserWithCredential({
    firstName: "Chinedu",
    lastName: "Okoro",
    role: Role.ADMIN,
    gender: Gender.MALE,
    state: "FCT",
    lga: "Abuja Municipal",
    address: "789 Garki Area, Abuja",
    email: "admin.excel@schoolpro.ng",
    password: "ExcelAdmin123!",
    schoolId: school.id
  });

  await prisma.admin.create({
    data: {
      userId: schoolAdmin.id,
      schoolId: school.id,
      permissions: "ALL"
    }
  });

  // Step 4: Create Grading System
  console.log("📊 Creating Grading System...");
  const gradingLevels = [
    { minScore: 75, maxScore: 100, grade: "A1", remark: "Excellent" },
    { minScore: 70, maxScore: 74, grade: "B2", remark: "Very Good" },
    { minScore: 65, maxScore: 69, grade: "B3", remark: "Good" },
    { minScore: 60, maxScore: 64, grade: "C4", remark: "Credit" },
    { minScore: 55, maxScore: 59, grade: "C5", remark: "Credit" },
    { minScore: 50, maxScore: 54, grade: "C6", remark: "Credit" },
    { minScore: 45, maxScore: 49, grade: "D7", remark: "Pass" },
    { minScore: 40, maxScore: 44, grade: "E8", remark: "Pass" },
    { minScore: 0, maxScore: 39, grade: "F9", remark: "Fail" }
  ];

  const gradingSystem = await prisma.gradingSystem.create({
    data: {
      name: "WAEC Standard Grading",
      description: "Standard WAEC grading system for secondary schools",
      isDefault: true,
      passMark: 40,
      schoolId: school.id,
      levels: {
        create: gradingLevels
      }
    }
  });

  // Step 5: Create Academic Session and Terms
  console.log("📅 Creating Academic Session...");
  const currentYear = new Date().getFullYear();
  const termsData = [
    {
      name: "First Term",
      startDate: new Date(currentYear, 8, 1),
      endDate: new Date(currentYear, 11, 15),
      isCurrent: true
    },
    {
      name: "Second Term",
      startDate: new Date(currentYear + 1, 0, 8),
      endDate: new Date(currentYear + 1, 3, 5)
    },
    {
      name: "Third Term",
      startDate: new Date(currentYear + 1, 4, 1),
      endDate: new Date(currentYear + 1, 6, 30)
    }
  ];

  const session = await prisma.session.create({
    data: {
      name: `${currentYear}/${currentYear + 1}`,
      startDate: new Date(currentYear, 8, 1), // September 1st
      endDate: new Date(currentYear + 1, 6, 30), // June 30th next year
      isCurrent: true,
      schoolId: school.id,
      terms: {
        create: termsData
      }
    },
    include: { terms: true }
  });

  const currentTerm = session.terms.find(term => term.isCurrent);

  // Step 6: Create Classes for different levels
  console.log("🏫 Creating Classes...");
  const classData = [
    // Primary Classes
    { name: "Primary 1", level: ClassLevel.PRIMARY },
    { name: "Primary 2", level: ClassLevel.PRIMARY },
    { name: "Primary 3", level: ClassLevel.PRIMARY },
    { name: "Primary 4", level: ClassLevel.PRIMARY },
    { name: "Primary 5", level: ClassLevel.PRIMARY },
    { name: "Primary 6", level: ClassLevel.PRIMARY },
    
    // JSS Classes
    { name: "JSS 1A", level: ClassLevel.JSS },
    { name: "JSS 1B", level: ClassLevel.JSS },
    { name: "JSS 2A", level: ClassLevel.JSS },
    { name: "JSS 2B", level: ClassLevel.JSS },
    { name: "JSS 3A", level: ClassLevel.JSS },
    { name: "JSS 3B", level: ClassLevel.JSS },
    
    // SSS Classes
    { name: "SSS 1 Science", level: ClassLevel.SSS },
    { name: "SSS 1 Arts", level: ClassLevel.SSS },
    { name: "SSS 1 Commercial", level: ClassLevel.SSS },
    { name: "SSS 2 Science", level: ClassLevel.SSS },
    { name: "SSS 2 Arts", level: ClassLevel.SSS },
    { name: "SSS 2 Commercial", level: ClassLevel.SSS },
    { name: "SSS 3 Science", level: ClassLevel.SSS },
    { name: "SSS 3 Arts", level: ClassLevel.SSS },
    { name: "SSS 3 Commercial", level: ClassLevel.SSS }
  ];

  const classes = await Promise.all(
    classData.map(data => createClass(school.id, data.name, data.level))
  );

  // Step 7: Create Subjects
  console.log("📚 Creating Subjects...");
  const subjectData = [];
  
  for (const [level, subjects] of Object.entries(SUBJECTS_BY_LEVEL)) {
    for (const subjectName of subjects) {
      subjectData.push({
        name: subjectName,
        code: generateSubjectCode(subjectName),
        schoolId: school.id
      });
    }
  }

  // Batch create subjects
  const allSubjects = [];
  for (let i = 0; i < subjectData.length; i += CONFIG.BATCH_SIZE) {
    const batch = subjectData.slice(i, i + CONFIG.BATCH_SIZE);
    const createdSubjects = await Promise.all(
      batch.map(data => prisma.subject.create({ data }))
    );
    allSubjects.push(...createdSubjects);
  }

  // Step 8: Create Class Terms and assign subjects
  console.log("🔗 Creating Class Terms and Subjects...");
  const classTerms = [];
  const classSubjectData = [];
  
  for (const classRecord of classes) {
    const classTerm = await prisma.classTerm.create({
      data: {
        classId: classRecord.id,
        termId: currentTerm!.id
      }
    });
    classTerms.push(classTerm);

    // Assign subjects to this class based on level
    const levelSubjects = allSubjects.filter(subject => {
      const subjectLevel = getSubjectLevel(subject.name);
      return subjectLevel === classRecord.level;
    });

    // Take up to CONFIG.SUBJECTS_PER_CLASS subjects per class
    const selectedSubjects = levelSubjects.slice(0, CONFIG.SUBJECTS_PER_CLASS);
    for (const subject of selectedSubjects) {
      classSubjectData.push({
        classId: classRecord.id,
        subjectId: subject.id,
        classTermId: classTerm.id
      });
    }
  }

  // Batch create class subjects
  for (let i = 0; i < classSubjectData.length; i += CONFIG.BATCH_SIZE) {
    const batch = classSubjectData.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(data => prisma.classSubject.create({ data }))
    );
  }

  // Step 9: Create Teachers
  console.log("👨‍🏫 Creating Teachers...");
  const teachers = [];
  const teacherSubjectData = [];
  const teacherClassTermData = [];
  
  for (let i = 0; i < CONFIG.TEACHER_COUNT; i++) {
    const gender = Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE;
    const state = NIGERIAN_STATES[Math.floor(Math.random() * NIGERIAN_STATES.length)];
    
    const teacherUser = await createUserWithCredential({
      firstName: faker.person.firstName(gender === Gender.MALE ? 'male' : 'female'),
      lastName: faker.person.lastName(),
      role: Role.TEACHER,
      gender,
      state: state.name,
      lga: `${state.capital} LGA`,
      address: `${faker.location.streetAddress()}, ${state.capital}`,
      email: `teacher${i+1}@excelcollege.edu.ng`,
      password: `Teacher${i+1}!`,
      schoolId: school.id
    });

    const teacher = await prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        schoolId: school.id,
        staffId: `TCH-${faker.number.int({ min: 1000, max: 9999 })}`,
        department: DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)],
        qualification: QUALIFICATIONS[Math.floor(Math.random() * QUALIFICATIONS.length)]
      }
    });
    teachers.push(teacher);

    // Assign 2-3 subjects to each teacher
    const subjectCount = 2 + Math.floor(Math.random() * (CONFIG.MAX_SUBJECTS_PER_TEACHER - 1));
    const teacherSubjects = allSubjects
      .sort(() => 0.5 - Math.random())
      .slice(0, subjectCount);
    
    for (const subject of teacherSubjects) {
      teacherSubjectData.push({
        teacherId: teacher.id,
        subjectId: subject.id,
        termId: currentTerm!.id
      });
    }

    // Assign teacher to 1-2 classes
    const classCount = 1 + Math.floor(Math.random() * (CONFIG.MAX_CLASSES_PER_TEACHER - 1));
    const assignedClasses = classes
      .sort(() => 0.5 - Math.random())
      .slice(0, classCount);
    
    for (const classRecord of assignedClasses) {
      const classTerm = classTerms.find(ct => ct.classId === classRecord.id);
      if (classTerm) {
        teacherClassTermData.push({
          teacherId: teacher.id,
          classTermId: classTerm.id
        });
      }
    }
  }

  // Batch create teacher subjects and class assignments
  console.log("📝 Assigning teacher subjects and classes...");
  for (let i = 0; i < teacherSubjectData.length; i += CONFIG.BATCH_SIZE) {
    const batch = teacherSubjectData.slice(i, i + CONFIG.BATCH_SIZE);
     const batchWithTermId = batch.map(data => ({
      ...data,
      termId: currentTerm!.id  // Add current term ID
    }));
    await Promise.all(
      batchWithTermId.map(data => prisma.teacherSubject.create({ data }))
    );
  }

  for (let i = 0; i < teacherClassTermData.length; i += CONFIG.BATCH_SIZE) {
    const batch = teacherClassTermData.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(data => prisma.teacherClassTerm.create({ data }))
    );
  }

  // Step 10: Create Students
  console.log("👨‍🎓 Creating Students...");
  const students = [];
  const studentClassTermData = [];
  const assessmentData = [];
  const currentYearAdmission = currentYear; // e.g. 2026 → 2026

  for (let i = 0; i < CONFIG.STUDENT_COUNT; i++) {
    const gender = Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE;
    const state = NIGERIAN_STATES[Math.floor(Math.random() * NIGERIAN_STATES.length)];
    
    const studentUser = await createUserWithCredential({
      firstName: faker.person.firstName(gender === Gender.MALE ? 'male' : 'female'),
      lastName: faker.person.lastName(),
      role: Role.STUDENT,
      gender,
      state: state.name,
      lga: `${state.capital} LGA`,
      address: `${faker.location.streetAddress()}, ${state.capital}`,
      dateOfBirth: faker.date.birthdate({ min: 5, max: 18, mode: 'age' }),
      email: `student${i+1}@excelcollege.edu.ng`,
      password: `Student${i+1}!`,
      schoolId: school.id
    });

    // Generate admission number
    const seq = await prisma.admissionSequence.upsert({
      where: {
        schoolId_year: {
          schoolId: school.id,
          year: currentYear,
        },
      },
      update: { lastSequence: { increment: 1 } },
      create: {
        schoolId: school.id,
        year: currentYear,
        lastSequence: school.admissionSequenceStart,
      },
    });

    const admissionNo = `EXC-${currentYear}-${seq.lastSequence}`;


    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        schoolId: school.id,
        admissionNo,
        year: currentYear
      }
    });
    students.push(student);

    // Assign student to a random class
    const randomClass = classes[Math.floor(Math.random() * classes.length)];
    const classTerm = classTerms.find(ct => ct.classId === randomClass.id);
    
    if (classTerm) {
      // FIXED: Added termId and status fields
      studentClassTermData.push({
        studentId: student.id,
        classTermId: classTerm.id,
        termId: currentTerm!.id,
        status: EnrollmentStatus.ACTIVE
      });
    }
  }

  // Batch create student class terms
  console.log("📚 Assigning students to classes...");
  const studentClassTerms = [];
  for (let i = 0; i < studentClassTermData.length; i += CONFIG.BATCH_SIZE) {
    const batch = studentClassTermData.slice(i, i + CONFIG.BATCH_SIZE);
    const createdRecords = await Promise.all(
      batch.map(data => prisma.studentClassTerm.create({ data }))
    );
    studentClassTerms.push(...createdRecords);
  }

  // Create sample assessments for the students
  console.log("📊 Creating assessments...");
  for (const studentClassTerm of studentClassTerms) {
    const classSubjects = await prisma.classSubject.findMany({
      where: { classTermId: studentClassTerm.classTermId },
      include: { subject: true }
    });

    for (const classSubject of classSubjects) {
      // FIXED: Added required fields createdBy and editedBy
      assessmentData.push({
        studentId: studentClassTerm.studentId,
        subjectId: classSubject.subjectId,
        termId: currentTerm!.id,
        studentClassTermId: studentClassTerm.id,
        teacherId: teachers[Math.floor(Math.random() * teachers.length)].id,
        ca1: Math.floor(Math.random() * 10) + 1, // 1–10
        ca2: Math.floor(Math.random() * 10) + 1, // 1–10
        ca3: Math.floor(Math.random() * 10) + 1, // 1–10
        exam: Math.floor(Math.random() * 70) + 1, // 1–70
        isPublished: Math.random() > 0.3,
        createdBy: schoolAdmin.id, // FIXED: Added required field
        editedBy: schoolAdmin.id,  // FIXED: Added required field
        isDraft: false
      });
    }
  }

  // Batch create assessments
  for (let i = 0; i < assessmentData.length; i += CONFIG.BATCH_SIZE) {
    const batch = assessmentData.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(data => prisma.assessment.create({ data }))
    );
  }

  // Step 11: Create Parents
  console.log("👪 Creating Parents...");
  const parents = [];
  const studentParentData = [];
  
  for (let i = 0; i < CONFIG.PARENT_COUNT; i++) {
    const gender = Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE;
    const state = NIGERIAN_STATES[Math.floor(Math.random() * NIGERIAN_STATES.length)];
    
    const parentUser = await createUserWithCredential({
      firstName: faker.person.firstName(gender === Gender.MALE ? 'male' : 'female'),
      lastName: faker.person.lastName(),
      role: Role.PARENT,
      gender,
      state: state.name,
      lga: `${state.capital} LGA`,
      address: `${faker.location.streetAddress()}, ${state.capital}`,
      email: `parent${i+1}@excelcollege.edu.ng`,
      password: `Parent${i+1}!`,
      schoolId: school.id
    });

    const parent = await prisma.parent.create({
      data: {
        userId: parentUser.id,
        schoolId: school.id,
        occupation: OCCUPATIONS[Math.floor(Math.random() * OCCUPATIONS.length)]
      }
    });
    parents.push(parent);

    // Assign 1-3 students to each parent
    const studentCount = 1 + Math.floor(Math.random() * (CONFIG.MAX_STUDENTS_PER_PARENT - 1));
    const parentStudents = students
      .sort(() => 0.5 - Math.random())
      .slice(0, studentCount);
    
    for (const student of parentStudents) {
      studentParentData.push({
        studentId: student.id,
        parentId: parent.id,
        relationship: Math.random() > 0.5 ? "Father" : "Mother"
      });
    }
  }

  // Batch create student-parent relationships
  for (let i = 0; i < studentParentData.length; i += CONFIG.BATCH_SIZE) {
    const batch = studentParentData.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(data => prisma.studentParent.create({ data }))
    );
  }

  // Step 12: Create Fee Structures and Sample Payments
  console.log("💰 Creating Fee Structures...");
  const feeStructures = [];
  const feeStructureData = [];
  
  for (const classRecord of classes) {
    for (const feeType of FEE_TYPES) {
      feeStructureData.push({
        name: `${classRecord.name} ${feeType} Fee`,
        description: `${feeType} fee for ${classRecord.name}`,
        amount: 5000 + Math.floor(Math.random() * 20000),
        classId: classRecord.id,
        termId: currentTerm!.id,
        isActive: true
      });
    }
  }

  // Batch create fee structures
  for (let i = 0; i < feeStructureData.length; i += CONFIG.BATCH_SIZE) {
    const batch = feeStructureData.slice(i, i + CONFIG.BATCH_SIZE);
    const createdFees = await Promise.all(
      batch.map(data => prisma.feeStructure.create({ data }))
    );
    feeStructures.push(...createdFees);
  }

  // Create sample payments for some students
  console.log("💳 Creating sample payments...");
  const paymentData = [];
  
  for (let i = 0; i < CONFIG.PAYMENT_COUNT; i++) {
    const student = students[Math.floor(Math.random() * students.length)];
    const feeStructure = feeStructures[Math.floor(Math.random() * feeStructures.length)];
    
    paymentData.push({
      studentId: student.id,
      feeStructureId: feeStructure.id,
      amount: feeStructure.amount,
      paymentDate: faker.date.recent({ days: 60 }),
      receiptNo: `REC-${Date.now()}-${i}`,
      paymentMethod: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
      status: Math.random() > 0.2 ? PaymentStatus.COMPLETED : PaymentStatus.PENDING
    });
  }

  // Batch create payments
  for (let i = 0; i < paymentData.length; i += CONFIG.BATCH_SIZE) {
    const batch = paymentData.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(
      batch.map(data => prisma.payment.create({ data }))
    );
  }

  console.log("✅ Seed data created successfully!");
  console.log("📊 Summary:");
  console.log(`   - Super Admins: ${superAdmins.length}`);
  console.log(`   - School: 1`);
  console.log(`   - Admin: 1`);
  console.log(`   - Teachers: ${teachers.length}`);
  console.log(`   - Students: ${students.length}`);
  console.log(`   - Parents: ${parents.length}`);
  console.log(`   - Classes: ${classes.length}`);
  console.log(`   - Subjects: ${allSubjects.length}`);
  console.log(`   - Assessments: ${assessmentData.length}`);
  console.log(`   - Payments: ${paymentData.length}`);

  console.log("\n🔑 Login Credentials:");
  console.log("   Super Admin 1: superadmin@schoolpro.ng / @HumSad01");
  console.log("   Super Admin 2: admin@schoolpro.ng / admin123");
  console.log("   School Admin: admin.excel@schoolpro.ng / ExcelAdmin123!");
  console.log(`   Teachers: teacher[1-${CONFIG.TEACHER_COUNT}]@excelcollege.edu.ng / Teacher[1-${CONFIG.TEACHER_COUNT}]!`);
  console.log(`   Students: student[1-${CONFIG.STUDENT_COUNT}]@excelcollege.edu.ng / Student[1-${CONFIG.STUDENT_COUNT}]!`);
  console.log(`   Parents: parent[1-${CONFIG.PARENT_COUNT}]@excelcollege.edu.ng / Parent[1-${CONFIG.PARENT_COUNT}]!`);
}

// Helper functions
async function createUserWithCredential(data: {
  firstName: string;
  lastName: string;
  role: Role;
  gender: Gender;
  state: string;
  lga: string;
  address: string;
  email: string;
  password: string;
  schoolId?: string;
  dateOfBirth?: Date;
}) {
  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      gender: data.gender,
      state: data.state,
      lga: data.lga,
      address: data.address,
      dateOfBirth: data.dateOfBirth,

      isActive: true
    }
  });

  await prisma.credential.create({
    data: {
      userId: user.id,
      type: CredentialType.EMAIL,
      value: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
      isPrimary: true
    }
  });

  return user;
}

async function createClass(schoolId: string, name: string, level: ClassLevel) {
  return prisma.class.create({
    data: {
      name,
      level,
      schoolId
    }
  });
}

function generateSubjectCode(subjectName: string): string {
  return subjectName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 4);
}

function getSubjectLevel(subjectName: string): ClassLevel {
  if (SUBJECTS_BY_LEVEL.PRIMARY.includes(subjectName)) return ClassLevel.PRIMARY;
  if (SUBJECTS_BY_LEVEL.JSS.includes(subjectName)) return ClassLevel.JSS;
  return ClassLevel.SSS;
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });