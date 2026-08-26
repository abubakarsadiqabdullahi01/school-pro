/**
 * Database restore — the half that makes a backup real.
 *
 * Run:  npx tsx scripts/restore-database.ts <backup-file.sql.gz>
 *
 * Restores into RESTORE_DATABASE_URL, never into DATABASE_URL. That is deliberate: the
 * point of rehearsing a restore is to prove the dump is good, and doing it over your live
 * database proves nothing while risking everything. Point RESTORE_DATABASE_URL at a scratch
 * database.
 *
 * Overriding this guard is possible with RESTORE_ALLOW_LIVE=i-understand, for the real
 * emergency. Read documentation/backup-and-restore.md first.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

/** As with the backup script — cron needs to be able to name the binary outright. */
const MYSQL_CLIENT = process.env.MYSQL_PATH ?? "mysql";

interface Target {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parse(raw: string, label: string): Target {
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!database) throw new Error(`${label} has no database name.`);

  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/restore-database.ts <backup-file.sql.gz>");
    process.exit(1);
  }

  const info = await stat(file).catch(() => null);
  if (!info) throw new Error(`No such backup file: ${file}`);
  if (info.size === 0) throw new Error("That backup file is empty.");

  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (!restoreUrl) {
    throw new Error(
      "RESTORE_DATABASE_URL is not set. Point it at a scratch database — restoring over " +
        "your live one proves nothing and risks everything.",
    );
  }

  const target = parse(restoreUrl, "RESTORE_DATABASE_URL");

  if (process.env.DATABASE_URL) {
    const live = parse(process.env.DATABASE_URL, "DATABASE_URL");
    const sameTarget =
      live.host === target.host && live.port === target.port && live.database === target.database;

    if (sameTarget && process.env.RESTORE_ALLOW_LIVE !== "i-understand") {
      throw new Error(
        `Refusing to restore over the live database (${target.database} at ${target.host}). ` +
          "This replaces every table. Set RESTORE_ALLOW_LIVE=i-understand if that is genuinely " +
          "what you intend.",
      );
    }
    if (sameTarget) {
      console.warn("⚠️  Restoring over the LIVE database, as explicitly permitted.\n");
    }
  }

  console.log(`Restoring ${file}`);
  console.log(`  -> ${target.database} at ${target.host}:${target.port}\n`);

  const child = spawn(
    MYSQL_CLIENT,
    [
      `--host=${target.host}`,
      `--port=${target.port}`,
      `--user=${target.user}`,
      "--default-character-set=utf8mb4",
      target.database,
    ],
    { env: { ...process.env, MYSQL_PWD: target.password }, stdio: ["pipe", "inherit", "pipe"] },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  await pipeline(createReadStream(file), createGunzip(), child.stdin);

  const exitCode: number = await new Promise((resolve) => child.on("close", resolve));

  if (exitCode !== 0) {
    throw new Error(`mysql exited ${exitCode}: ${stderr.trim().split("\n").slice(-3).join(" ")}`);
  }

  console.log("Restore completed.\n");
  console.log("Now check it actually worked — a restore that runs is not a restore that is");
  console.log("correct. Against the restored database, confirm the row counts look right:");
  console.log(`  mysql --host=${target.host} --port=${target.port} --user=${target.user} ${target.database} \\`);
  console.log(`    -e "SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM students) students, (SELECT COUNT(*) FROM assessments) assessments;"`);
}

main().catch((error) => {
  console.error(`\nRestore FAILED: ${(error as Error).message}`);
  process.exit(1);
});
