# Archived PostgreSQL migrations

These four migrations are **not runnable** and are kept only as history. Do not move them
back into `prisma/migrations/`.

## What happened

The project began on PostgreSQL (Neon, then Azure) and later moved to MySQL — local dev in
Docker, production on cPanel. `schema.prisma` was switched to `provider = "mysql"` and
`migration_lock.toml` was updated to match, but the migration SQL was never regenerated. So
the folder contained PostgreSQL DDL:

```sql
CREATE TYPE "public"."Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', ...);
```

MySQL has no `CREATE TYPE`, and no `public` schema. Running `prisma migrate deploy` against
a fresh MySQL database would have failed on the first statement — and because the lock file
already claimed `mysql`, Prisma would not have caught the mismatch itself.

In practice the databases were being created with `prisma db push`, which reads the schema
directly and never consults this folder. That works until the first migration you actually
need to review, stage, or roll back.

The three later migrations only add constraints and indexes; all of that is folded into the
new baseline, so nothing is lost.

## The replacement

`prisma/migrations/20260825120000_mysql_baseline/migration.sql` — generated from the current
schema with:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

It is 684 lines covering all 31 models in MySQL syntax, `utf8mb4_unicode_ci` throughout to
match what cPanel generates.

## Baselining an existing database

Every database that already has these tables must be told the baseline is already applied,
or Prisma will try to create tables that exist. Run this **once per environment** — local,
staging, production:

```bash
npx prisma migrate resolve --applied 20260825120000_mysql_baseline
```

That writes one row to `_prisma_migrations` and changes no table. Verify with
`npx prisma migrate status`, which should then report the schema up to date.

For a genuinely empty database, use `npx prisma migrate deploy` instead — it will run the
baseline properly.

## Before running this on production

1. Take a dump first. There is no configured backup yet, so this is manual.
2. Run `migrate resolve` on a restored copy of production and confirm
   `migrate status` reports no pending work.
3. Confirm the schema matches what the baseline describes:
   `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$DATABASE_URL" --script`

   **Expect roughly 26 `CREATE INDEX … _fkey` statements and nothing else.** Those are the
   backing indexes MySQL creates automatically for every foreign key; Prisma does not
   declare them in the schema, so it reports them as a difference. They are benign. This
   was verified against the local Docker database on 25 Aug 2026 — 26 statements, all of
   them `_fkey` indexes, no table or column differences.

   Anything that is *not* a `_fkey` index — a `CREATE TABLE`, an `ALTER TABLE`, a dropped
   column — is real drift and must be resolved before baselining. Filter for it with:

   ```bash
   npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$DATABASE_URL" --script \
     | grep '^CREATE\|^ALTER\|^DROP' | grep -v '_fkey`'
   ```
4. Only then run it against production.

## After this

Stop using `db push` outside of throwaway local experiments. Schema changes go through
`prisma migrate dev`, which produces a reviewable SQL file — which is the whole point of
fixing this.
