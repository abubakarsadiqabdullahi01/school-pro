# Backup and restore

DigiSchool-Pro holds a school's entire academic record — and, once finance ships, its fee ledger.
Until this was set up there was no backup at all: `performSystemBackup` honestly returned
"not configured", which was better than the fake success it replaced, but the underlying
fact was unchanged.

## What exists now

| Piece | Where |
| --- | --- |
| Backup | `scripts/backup-database.ts` |
| Restore | `scripts/restore-database.ts` |
| Status shown in the app | `getBackupStatus()`, read from `SystemConfiguration.lastBackup` |

Backups are a **scheduled job, not a button**. A full dump takes longer than a web request
should, and the app process on shared hosting has no business shelling out to `mysqldump`.
The system settings screen reports the last run; it does not start one.

## Setting it up

Both scripts need `mysqldump` and `mysql` on the PATH. On cPanel they normally are; check
with `which mysqldump`.

```bash
BACKUP_DIR=/home/YOURUSER/digischool-pro-backups BACKUP_RETENTION_DAYS=14 npx tsx scripts/backup-database.ts
```

Defaults: `./backups` and 14 days. The dump is gzipped and named
`school_pro-<ISO timestamp>.sql.gz`.

### Scheduling it

In cPanel → Cron Jobs, nightly at 01:30:

```
30 1 * * * cd /home/YOURUSER/digischool-pro && BACKUP_DIR=/home/YOURUSER/digischool-pro-backups /usr/bin/npx tsx scripts/backup-database.ts >> /home/YOURUSER/backup.log 2>&1
```

Use absolute paths — cron has almost no PATH. Confirm the first run landed:

```bash
ls -lh /home/YOURUSER/digischool-pro-backups
```

The script records failures as well as successes, so a cron job that silently stops working
shows up in the app rather than only in a log nobody reads.

### Get the dumps off the server

**A backup on the same disk as the database is not a backup.** A failed disk, a mistaken
`rm -rf`, or a compromised account takes both. Sync the directory somewhere else — the
project already has S3 credentials, or use `rclone`, or a nightly `rsync` to another host.
This is the step most often skipped and the one that matters most.

## Rehearsing the restore

A backup you have never restored is a hope, not a backup. Do this **now**, and again after
any change to the schema or hosting.

The restore script refuses to write to `DATABASE_URL` unless explicitly overridden, because
restoring over your live database proves nothing while risking everything. Point it at a
scratch database:

```bash
mysql -e "CREATE DATABASE school_pro_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

RESTORE_DATABASE_URL="mysql://user:pass@localhost:3306/school_pro_restore_test" \
  npx tsx scripts/restore-database.ts backups/school_pro-2026-08-25T01-30-00-000Z.sql.gz
```

Then check it is actually correct, not merely that the command exited 0:

1. Row counts match production — the script prints the query to run.
2. `npx prisma migrate status` against the restored database reports up to date.
3. Spot-check one class's results and one student's report card.

Write down **how long the whole thing took**. That number is your recovery time, and it is
the only honest answer to "how long would we be down". Guessing it is how organisations
discover their recovery plan does not work on the day they need it.

Drop the scratch database when finished.

## In a real emergency

```bash
RESTORE_DATABASE_URL="$DATABASE_URL" RESTORE_ALLOW_LIVE=i-understand \
  npx tsx scripts/restore-database.ts <newest-good-backup>
```

Before running it: take a dump of the current broken state first. A corrupted database still
holds evidence of what went wrong, and once you restore over it that evidence is gone.
