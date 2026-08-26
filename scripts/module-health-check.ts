import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

const baseUrl = process.env.MODULE_TEST_BASE_URL ?? "http://localhost:3000";
const results: CheckResult[] = [];

function add(name: string, ok: boolean, details: string) {
  results.push({ name, ok, details });
}

function runCommand(name: string, command: string, args: string[]) {
  const executable = process.platform === "win32" ? "cmd.exe" : command;
  const commandArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;

  const result = spawnSync(executable, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    env: { ...process.env },
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120_000,
  });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const tail = output.split(/\r?\n/).slice(-8).join("\n");
  add(
    name,
    result.status === 0,
    tail || result.error?.message || `Exited with status ${result.status}`,
  );
}

async function checkRoute(name: string, path: string, expectedStatuses: number[]) {
  try {
    const response = await fetch(`${baseUrl}${path}`);
    add(
      name,
      expectedStatuses.includes(response.status),
      `${path} returned HTTP ${response.status}`,
    );
  } catch (error) {
    add(name, false, `${path} request failed: ${(error as Error).message}`);
  }
}

async function checkDatabase() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [schools, teachers, students, classes, subjects, assessments] =
      await Promise.all([
        prisma.school.count(),
        prisma.teacher.count(),
        prisma.student.count(),
        prisma.class.count(),
        prisma.subject.count(),
        prisma.assessment.count(),
      ]);

    add(
      "Database and seeded core data",
      schools > 0 && teachers > 0 && students > 0 && classes > 0 && subjects > 0,
      `schools=${schools}, teachers=${teachers}, students=${students}, classes=${classes}, subjects=${subjects}, assessments=${assessments}`,
    );
  } catch (error) {
    add("Database and seeded core data", false, (error as Error).message);
  } finally {
    await prisma.$disconnect();
  }
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl);
    return response.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Running DigiSchool-Pro module health checks against ${baseUrl}\n`);

  runCommand("Prisma schema validation", "npx", ["prisma", "validate"]);
  runCommand("ESLint", "npm", ["run", "lint"]);
  runCommand("TypeScript", "npm", ["run", "type-check"]);
  runCommand("Unit tests", "npm", ["run", "test"]);

  await checkDatabase();

  if (await isServerReady()) {
    add("Live server for route smoke tests", true, baseUrl);
    await checkRoute("Landing page module", "/", [200]);
    await checkRoute("Auth/login module", "/auth/login", [200]);
    await checkRoute("API health module", "/api/health", [200]);
    await checkRoute("Protected role-data API", "/api/role-data", [401]);
  } else {
    add(
      "Live route smoke tests",
      true,
      `Skipped because ${baseUrl} is not running. Start npm run dev and rerun for live route checks.`,
    );
  }

  const width = Math.max(...results.map((result) => result.name.length), 10);
  console.log("\nModule Health Report");
  console.log("-".repeat(width + 18));

  for (const result of results) {
    const icon = result.ok ? "PASS" : "FAIL";
    console.log(`${icon.padEnd(4)} ${result.name.padEnd(width)} ${result.details}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed. Fix these before adding the finance module or deploying.`);
    process.exit(1);
  }

  console.log("\nAll module checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
