// Emits the SQL that creates one super admin, for hosts where running node
// against the database is not practical.
//
// The cPanel account this targets kills a second node process (SIGABRT, exit
// -6) while the app is serving, so `seed-super-admin.mjs` cannot be run there
// without stopping the site first. This produces the same rows — users,
// SuperAdmin, Credential with a bcrypt hash at the cost the app verifies
// against — to paste into phpMyAdmin instead.
//
// The password is read from the environment, never from argv, so it does not
// land in shell history or the process list:
//
//   SEED_PASSWORD='...' node scripts/make-super-admin-sql.mjs
//
// Override SEED_EMAIL / SEED_FIRST / SEED_LAST for a different account.
// SEED_UPDATE=1 emits a password reset for an existing account instead.
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"

const password = process.env.SEED_PASSWORD
if (!password || password.length < 8) {
  console.error("Set SEED_PASSWORD to the password for this account (at least 8 characters).")
  process.exit(1)
}

const email = (process.env.SEED_EMAIL ?? "admin@schoolpro.ng").trim().toLowerCase()
const firstName = process.env.SEED_FIRST ?? "Rabiu"
const lastName = process.env.SEED_LAST ?? "Muhammad"
const address = process.env.SEED_ADDRESS ?? "456 Victoria Island, Gombe"

// Cost 12, matching lib/seed-super-admin.ts — a hash at a different cost still
// verifies, but keeping them equal means every account costs the same to check.
const hash = await bcrypt.hash(password, 12)

const userId = randomUUID()
const superAdminId = randomUUID()
const credentialId = randomUUID()

const BACKSLASH = String.fromCharCode(92)
const quote = (value) =>
  "'" + String(value).split(BACKSLASH).join(BACKSLASH + BACKSLASH).split("'").join("''") + "'"

// Password reset for an account that already exists. The login page links to
// /auth/forgot-password, but no such route exists, so this is the only way back
// in for someone who has lost their password.
if (process.env.SEED_UPDATE) {
  console.log(`-- Password reset for ${email}. Affects exactly one row; 0 rows means
-- the address is not in Credential — check the spelling before re-running.
UPDATE \`Credential\`
   SET \`passwordHash\` = ${quote(hash)}, \`updatedAt\` = NOW(3)
 WHERE \`value\` = ${quote(email)} AND \`type\` = 'EMAIL';`)
  process.exit(0)
}

console.log(`-- Super admin: ${email}
-- Run in phpMyAdmin against digisof1_schoolpro. The unique index on
-- Credential.value makes this fail rather than duplicate if the email exists.
START TRANSACTION;

INSERT INTO \`users\`
  (\`id\`, \`firstName\`, \`lastName\`, \`role\`, \`gender\`, \`state\`, \`lga\`, \`address\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
VALUES
  (${quote(userId)}, ${quote(firstName)}, ${quote(lastName)}, 'SUPER_ADMIN', 'MALE', 'Gombe', 'Gombe North', ${quote(address)}, 1, NOW(3), NOW(3));

INSERT INTO \`SuperAdmin\` (\`id\`, \`userId\`, \`createdAt\`, \`updatedAt\`)
VALUES (${quote(superAdminId)}, ${quote(userId)}, NOW(3), NOW(3));

INSERT INTO \`Credential\`
  (\`id\`, \`userId\`, \`type\`, \`value\`, \`passwordHash\`, \`isPrimary\`, \`createdAt\`, \`updatedAt\`)
VALUES
  (${quote(credentialId)}, ${quote(userId)}, 'EMAIL', ${quote(email)}, ${quote(hash)}, 1, NOW(3), NOW(3));

COMMIT;`)
