/**
 * Database backup.
 *
 * Run:  npx tsx scripts/backup-database.ts
 *
 * Designed to be a cron job, not a button. A full dump takes longer than a web request
 * should, and the app process on shared hosting has no business shelling out to mysqldump.
 * The system settings screen reads the status this script records; it does not start it.
 *
 * What it does:
 *   1. Dumps the database named in DATABASE_URL with mysqldump, gzipped.
 *   2. Writes it to BACKUP_DIR (default ./backups) as school_pro-<timestamp>.sql.gz
 *   3. Deletes dumps older than BACKUP_RETENTION_DAYS (default 14).
 *   4. Records the result in SystemConfiguration so the app can report it.
 *
 * A backup you have never restored is a hope, not a backup. See
 * documentation/backup-and-restore.md for the restore rehearsal.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { createGzip } from "node:zlib";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const BACKUP_STATUS_KEY = "lastBackup";
/**
 * cron has almost no PATH, so being able to name the binary outright matters more than
 * it looks. Set MYSQLDUMP_PATH=/usr/bin/mysqldump if a bare `mysqldump` is not found.
 */
const MYSQLDUMP = process.env.MYSQLDUMP_PATH ?? "mysqldump";

interface Target {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(): Target {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");

  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!database) throw new Error("DATABASE_URL has no database name.");

  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

/**
 * Runs mysqldump straight into a gzip stream.
 *
 * The password goes in via MYSQL_PWD rather than --password, so it does not appear in the
 * process list where any other user on a shared host could read it.
 */
async function dump(target: Target, destination: string): Promise<number> {
  const child = spawn(
    MYSQLDUMP,
    [
      `--host=${target.host}`,
      `--port=${target.port}`,
      `--user=${target.user}`,
      "--single-transaction", // consistent snapshot without locking the whole database
      "--routines",
      "--triggers",
      "--default-character-set=utf8mb4",
      target.database,
    ],
    { env: { ...process.env, MYSQL_PWD: target.password }, stdio: ["ignore", "pipe", "pipe"] },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  /**
   * A failure to launch at all arrives as an `error` event, not a non-zero exit — and
   * without this it becomes an unhandled rejection that takes the process down before the
   * failure can be recorded. That is precisely the cron case: cron has almost no PATH, so
   * "mysqldump not found" is the most likely way this ever breaks, and it has to be
   * reported rather than crash.
   */
  const launchFailure = new Promise<never>((_resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? `mysqldump was not found at "${MYSQLDUMP}". Install the MySQL client tools, ` +
              "or set MYSQLDUMP_PATH to an absolute path such as /usr/bin/mysqldump."
            : `Could not start mysqldump: ${error.message}`,
        ),
      );
    });
  });

  const out = createWriteStream(destination);

  try {
    await Promise.race([pipeline(child.stdout, createGzip({ level: 9 }), out), launchFailure]);
  } catch (error) {
    throw new Error(`Failed while writing the dump: ${(error as Error).message}`);
  }

  const exitCode: number = await new Promise((resolve) => child.on("close", resolve));

  if (exitCode !== 0) {
    // mysqldump warns about things that are not failures, so only the exit code decides.
    throw new Error(`mysqldump exited ${exitCode}: ${stderr.trim().split("\n").slice(-3).join(" ")}`);
  }

  const { size } = await stat(destination);
  if (size === 0) throw new Error("The dump is empty — treating this as a failed backup.");

  return size;
}

/** Removes dumps past the retention window. Returns how many went. */
async function prune(): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const name of await readdir(BACKUP_DIR)) {
    if (!name.startsWith("school_pro-") || !name.endsWith(".sql.gz")) continue;

    const full = path.join(BACKUP_DIR, name);
    const info = await stat(full);
    if (info.mtimeMs < cutoff) {
      await unlink(full);
      removed++;
    }
  }

  return removed;
}

/** Records the outcome so the system settings screen can report it honestly. */
async function record(value: Record<string, unknown>) {
  const existing = await prisma.systemConfiguration.findFirst({
    where: { schoolId: null, configKey: BACKUP_STATUS_KEY },
    select: { id: true },
  });

  const data = {
    configValue: JSON.stringify(value),
    configType: "STRING",
    description: "Most recent database backup, written by scripts/backup-database.ts",
    isActive: true,
  };

  if (existing) {
    await prisma.systemConfiguration.update({ where: { id: existing.id }, data });
  } else {
    await prisma.systemConfiguration.create({
      data: { schoolId: null, configKey: BACKUP_STATUS_KEY, ...data },
    });
  }
}

async function main() {
  const startedAt = new Date();
  const target = parseDatabaseUrl();

  await mkdir(BACKUP_DIR, { recursive: true });

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `school_pro-${stamp}.sql.gz`);

  console.log(`Backing up ${target.database} at ${target.host}:${target.port}`);
  console.log(`  -> ${file}`);

  try {
    const sizeBytes = await dump(target, file);
    const removed = await prune();
    const completedAt = new Date();

    await record({
      status: "ok",
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      file,
      sizeBytes,
      prunedOldBackups: removed,
      retentionDays: RETENTION_DAYS,
    });

    const seconds = ((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
    console.log(
      `Done in ${seconds}s — ${(sizeBytes / 1024 / 1024).toFixed(2)} MB` +
        (removed > 0 ? `, pruned ${removed} old backup(s)` : ""),
    );
  } catch (error) {
    const message = (error as Error).message;

    // A part-written or empty dump must not be left behind looking like a backup.
    await unlink(file).catch(() => {});

    // Recorded on failure too, so a silently broken cron job is visible in the app rather
    // than only in a log nobody reads. The message is truncated because this lands in a
    // settings column, not a log file.
    await record({
      status: "failed",
      startedAt: startedAt.toISOString(),
      failedAt: new Date().toISOString(),
      error: message.slice(0, 300),
    });

    console.error(`Backup FAILED: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
