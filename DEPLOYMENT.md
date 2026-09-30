# Deploying school-pro to cPanel

Written for a CloudLinux/Passenger cPanel account — the kind where **Setup Node.js
App** appears under *Software*. Every number quoted below came from the target
account's own statistics panel; check yours before assuming they still hold.

## Why this is not the usual "upload and npm install"

Three limits on a shared cPanel account decide the whole approach:

| Limit | Value | What it rules out |
|---|---|---|
| Physical memory | **1 GB** | `next build` on the server. This app builds ~200 routes; it will run out of memory. |
| Disk | **~6.3 GB free** of 9.77 GB | A dev-style checkout. The local `.next` cache alone is 4.9 GB and `node_modules` is 987 MB. |
| I/O | **1 MB/s, 1,024 IOPS** | `npm install` of 987 MB on the server. It would take hours and may trip resource limits. |

So the app is **built on your machine and uploaded as a finished bundle**.
`next.config.ts` sets `output: 'standalone'`, which makes that practical: Next
traces only the code actually reached and emits a self-contained `server.js`.

The packaging command prints the current bundle size. Zip and upload that
finished bundle; no application dependency install or Next build runs on the
server.

The bundle deliberately contains **no `.env`** — Next copies env files into
standalone output by design, so the packaging script deletes them and then
refuses to finish if any survived. Credentials go in the cPanel UI instead.

## One-time setup on the server

### 1. Choose the domain

You have **one addon domain slot left (4/5)** but **unlimited subdomains** (10 in
use). Unless this needs its own registered domain, use a subdomain — it costs no
slot and AutoSSL covers it.

Create it under *Domains > Domains > Create A Domain*. **Do not use the Sitejet
Domains page** — Sitejet is a website builder, and a domain created through it is
pointed at builder-managed content, not at a Node application.

Leave **Share document root** unchecked and give the domain a dedicated document
root under `public_html`, for example `public_html/schoolpro`. The current cPanel
Domains interface does not permit a document root outside `public_html`. Keep
application code, uploads, and secrets out of this web-served directory.

### 2. Create the database

*Databases > MySQL Databases*: create a database and a user, then **add the user
to the database with ALL PRIVILEGES**. cPanel prefixes both names with your
account, so you end up with something like `digisof1_schoolpro` and
`digisof1_appuser`.

Prisma targets MySQL already (`prisma/schema.prisma`), so no schema change is
needed.

### 2b. Create the uploads directory

Avatars, school logos and expenditure receipts are written to disk, not to object
storage. Create a directory **outside both the document root and the application
root**:

```bash
mkdir -p /home/ACCOUNT/apps/school-pro-storage/uploads
```

Outside the document root because anything web-served is downloadable by URL, and
receipts must only be reachable through `/api/files/`, which checks the viewer's
school and expenditure permission first. Outside the application root so that
re-uploading the bundle cannot overwrite it.

Set `UPLOAD_DIR` to this path in step 4. Back it up separately from the database:
the database stores only the `/api/files/...` reference, never the bytes.

### 3. Create the Node.js application

*Software > Setup Node.js App > Create Application*:

| Field | Value |
|---|---|
| Node.js version | **20.x or newer** — Next 16 requires ≥ 20.9 |
| Application mode | Production |
| Application root | `apps/digisoft-school-pro` under the account home, outside `public_html` |
| Application URL | the domain from step 1 |
| Application startup file | `server.js` |

Leave `PORT` unset everywhere. Passenger assigns one and `server.js` reads it;
hardcoding a port binds the app where Passenger is not listening.

### 4. Set the environment variables

In the same screen, add every variable from `.env.production.example`.

Check these carefully:

- **`AUTH_TRUST_HOST=true`** is required here and not needed locally. Passenger
  runs the app behind Apache/LiteSpeed as a reverse proxy, so the Host header no
  longer matches what NextAuth v5 derives on its own, and it refuses the request
  with `UntrustedHost` — every sign-in fails. This was reproduced against the
  actual bundle and confirmed fixed by this variable; no code change is needed.
- **`UPLOAD_DIR`** must be an absolute path, and the one created in step 2b.
  `lib/env-validation.ts` now rejects a missing or relative value on the first
  page render, so a mistake here shows up immediately rather than at the first
  file upload.
- **`SUPER_ADMIN_PASSWORD` / `SECOND_SUPER_ADMIN_PASSWORD`** are only read by
  the seed. Remove them once both accounts can sign in.
- **`DATABASE_URL`** is still used by Prisma migrations and by the MariaDB
  driver adapter. URL-encode reserved characters in the password.

Enter these in cPanel rather than uploading a `.env` file, so the values never
exist as a readable file under the account.

#### Paystack webhook URL: no trailing slash

In the Paystack dashboard (**Settings > API Keys & Webhooks**), set the webhook URL
to `https://<host>/api/webhooks/paystack`, with **no slash at the end**. The app
answers `/paystack/` with a redirect to `/paystack`, and Paystack does not follow
redirects, so with the slash no webhook ever arrives. Dedicated-account transfers
and payer identification have no other way in. A school on its own Paystack account
copies its URL from **Payment Settings**; one copied before this release ended in a
slash and must be copied again.

### 5. Schedule the background jobs

Three things in this application do not happen on a web request, and none of them
runs unless cPanel is told to call it. Miss these and the failures are quiet: the
application looks healthy, a parent's payment sits unconfirmed, and a school
believes it has messaged families when nothing has left the building.

All three are POST endpoints guarded by the same `PAYMENT_CRON_SECRET`. Add them
under **Cron Jobs** in cPanel.

**The cron shell cannot see the app's variables.** What you set in *Setup Node.js
App* reaches the running application only. A cron line that says
`$PAYMENT_CRON_SECRET` sends an empty token, every call is refused with 401, and
nothing says so. Put the secret in a private file instead:

1. In **File Manager**, in your home directory (not `public_html`), create a file
   named `.digischool-cron-secret` containing only the `PAYMENT_CRON_SECRET` value,
   on one line.
2. Right-click it, **Change Permissions**, and set `600` (owner read/write only).
3. At the top of **Cron Jobs**, set **Cron Email** to an address someone reads. The
   commands below print nothing when they succeed and print the error when they
   fail, so a refused or failing job arrives as an email instead of going unseen.

| Every | Command |
|---|---|
| 1 minute | `curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $(cat $HOME/.digischool-cron-secret)" https://<host>/api/cron/payments/process-events` |
| 2–5 minutes | `curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $(cat $HOME/.digischool-cron-secret)" https://<host>/api/cron/notifications` |
| 1 hour | `curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $(cat $HOME/.digischool-cron-secret)" https://<host>/api/cron/payments/reconcile` |

The file and the app's `PAYMENT_CRON_SECRET` must hold the same value; change both
together. To check a line by hand, run it once from **Terminal** if your host has
it, or temporarily set its schedule to every minute and watch for an email.

What each one is for:

- **process-events** is the safety net under the payment webhook, and it does two
  separate jobs. It retries webhook deliveries whose processing failed, and — the
  part that is easy to miss — it scans checkouts that have no webhook row at all,
  asks Paystack directly what happened to each, and posts the ones that succeeded
  through the same idempotent path. That second half is what covers the worst
  case: Paystack never reaches the server AND the parent never returns to the
  status page. Without it, a payment taken from a parent could sit unposted with
  nobody aware of it.
- **notifications** drains the message outbox. Queueing a message and sending it
  are deliberately separate, so a provider outage delays delivery instead of
  losing the result release or the receipt that triggered it. It sends only if the
  `SMARTSMS_*` variables from `.env.production.example` are set; without them every
  message stays queued and `/api/health` shows `"providersConfigured": false`.
- **reconcile** matches provider settlements against what the ledger recorded.

`scripts/drain-notification-outbox.ts` does the same work as the notifications
endpoint and still works locally, but it cannot be used here: `./scripts/**` is
excluded from the standalone build, and cPanel has no terminal to run it from.

Set `PAYMENT_CRON_SECRET` to at least 24 random characters. Without the header the
endpoints return 401, which is what stops anyone on the internet from driving
them.

## Every deploy

### On your machine

```bash
npm run build:deploy
```

The generated Prisma client now uses a JavaScript query engine and the MariaDB
driver adapter. `prisma/schema.prisma` sets:

```prisma
engineType = "client"
```

Application queries use `@prisma/adapter-mariadb` and the MariaDB Node driver.
They do not load a platform-specific Prisma `.so` file. The prior cPanel crash
occurred inside the Rust query engine's timer runtime, so this changes the
query path that failed. It does not prove database connectivity until a read-only
check succeeds on the host. Prisma's migration CLI is a separate tool and can
still have different runtime requirements.

**The second trap is a symlink.** Standalone output contains
`.next/node_modules/@prisma/client-<hash>` as a link to an *absolute* path on the
build machine. Uploaded as a link it dangles immediately and Prisma cannot
resolve, so the packaging script replaces every symlink with a real copy of its
target and then fails if any remain. The packaging script also copies the
MariaDB adapter and its runtime dependencies so the separately bundled
`seed-super-admin.mjs` and `cpanel-check.mjs` can import them. It removes stale
query-engine binaries from earlier builds.

This runs `prisma generate`, builds, and assembles `deploy/` with the files
Passenger needs — `server.js` plus traced `node_modules`, `.next/static`, `public/`,
and `prisma/` for migrations — plus the super-admin seed and a read-only database
check. It prints the final size.

`.next/static` and `public/` are the step people miss: standalone output excludes
both, and without them the app boots and serves HTML with no CSS, no JS and no
images. The script copies them in and fails loudly if `server.js` is absent.

### Upload

Make the archive with:

```bash
npm run package:zip
```

which writes `outputs/digisoft-school-pro-cpanel-bundle-<timestamp>.zip`.
Upload it through *File Manager* and extract it into the application root — far
faster than thousands of individual files at 1 MB/s. The archive holds the **contents**
of `deploy/`, not the folder, so extract it directly in the application root.

Use that script rather than Windows' own zip tools: both `Compress-Archive` and
`ZipFile::CreateFromDirectory` write entry names with **backslashes** on
PowerShell 5.1, and Linux `unzip` then produces a flat directory of files
literally named `.next\build-manifest.json` — the app never starts. The script
writes forward slashes and refuses to include an env file.

`deploy/` is gitignored, so it never enters the repository.

#### Delete `.next` on the server before extracting

Not optional, and not tidiness. Extracting an archive over a directory can only
**overwrite and add** — it can never remove a file the new build no longer
produces. So every upload onto an existing `.next` leaves the previous build's
chunks behind, and they accumulate: after three deploys the folder is three
builds deep and only the newest is referenced.

Usually that is only wasted disk. It stops being harmless when a stale file
shadows something the new build expects, and the symptom is the kind that wastes
an afternoon: most of the application works, one route throws, and the page's own
code is provably fine. That is exactly how the super-admin System Settings screen
failed on 21 September 2026 — it rendered 200 with real content in dev and in a
local production build against an identically-built database, and failed only on
the host. Deleting `.next` and extracting clean fixed it.

So the order is:

1. Upload the zip to the application root.
2. **Delete the whole `.next` folder** in that directory.
3. Extract the zip.
4. Restart.

The site returns 500 between steps 2 and 3. That is a minute or two, and it is
worth it: it is the only way to know the code on disk is this build and nothing
else.

### Check the database, then apply migrations

After uploading the new bundle, run **check:cpanel** from *Setup Node.js App >
Run JS script*. The bundled check uses the MariaDB adapter and reports connection
status, table count, and whether the migration, user and school tables exist. It
makes no changes. Stop if it cannot connect; a successful native library load from
the old diagnostic is not a database connection check.

**This account has no terminal**, so `node cpanel-check.mjs` by hand is not an
option — the *Run JS script* dropdown is the only way to run it, and it appears
there because the deployed `package.json` maps `check:cpanel` to it.

Applying migrations is the step with no route on the host. The upload carries
`prisma/schema.prisma` and `prisma/migrations`, but not the Prisma CLI: that is a
local development dependency, and `npx` on this constrained account may try to
install. So pick whichever of these two is available to you:

**If the host will whitelist your IP for remote MySQL**, apply them from your own
machine. Point `DATABASE_URL` at the host's *remote* MySQL hostname with the
production database and credentials — `localhost` copied from the cPanel app
setting would mean your own machine. Leave the cPanel app's `localhost` URL alone:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

`migrate deploy` only applies what is pending and does not reset data. Never use
`migrate dev` against production.

**If remote MySQL is not available**, use the SQL file route in *Releasing over a
database used for testing* below. `npm run build:release-sql` writes a single file
that phpMyAdmin can import, including the migration history, so the schema and its
record arrive together with no CLI on either end. That path is for a database you
are starting fresh; it does not migrate a database that already holds data you
want to keep. For that, use the upgrade file below.

#### A release that changes the database, once it holds real data

Most releases change no tables: upload the bundle and restart, nothing else. When a
release adds a migration, build an **upgrade** file instead of a reset:

1. In phpMyAdmin, on the live database, find where it is:
   ```sql
   SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1;
   ```
2. On your machine, build the upgrade from that name:
   ```bash
   npm run build:release-sql -- digisof1_schoolpro --upgrade-from <that migration_name>
   ```
   It writes `outputs/release-upgrade-digisof1_schoolpro-<stamp>.sql` holding only
   the newer migrations. It drops nothing.
3. **Export** the live database in phpMyAdmin first, as a backup.
4. Import the upgrade file. Its guards stop it before it changes anything if the
   database is not at the migration you named, or if a migration in it is already
   applied (importing it twice): both show as `#1048 - Column 'step' cannot be
   null`. Any other error part-way leaves that migration recorded as not finished,
   which `check:cpanel` and Prisma both show; restore the backup and ask.
5. Upload the bundle, restart, and run **check:cpanel**.

Upload the bundle only after the upgrade: new code on the old tables fails on the
first query that touches a new column.

Either way, run **check:cpanel** again afterwards and confirm the migration table
is present before seeding.

### Create the first account (first deploy only)

The database starts empty, so there is nobody to sign in as. `prisma/seed.ts`
runs through `tsx` locally, but `tsx` is a devDependency and the host cannot
execute TypeScript — so the packaging script compiles the same
`lib/seed-super-admin.ts` logic into `deploy/seed-super-admin.mjs`, which plain
node can run:

```bash
node seed-super-admin.mjs
```

After a successful read-only database connection check and migration, run the
seed through the app's Node environment. Set `SUPER_ADMIN_PASSWORD` and
`SECOND_SUPER_ADMIN_PASSWORD` in cPanel (at least eight characters each). It
creates `superadmin@schoolpro.ng` and `admin@schoolpro.ng`, with super admin
profiles and hashed login credentials — no school or demo data. It can run on an
existing database without deleting data. Re-running preserves existing matching
accounts and passwords; it refuses to elevate an incompatible account with either
email. The deployed `package.json` also maps cPanel's `seed` and
`seed:super-admin` menu items to `node seed-super-admin.mjs`, avoiding the missing
`tsx` error. Remove both password variables afterwards.

Then **Restart** the application from the cPanel UI. Passenger caches the running
process; an upload alone does not pick up new code.

## Releasing over a database used for testing

A database that has been clicked through during testing carries rows nobody wants
in a release: half-finished payroll runs, test vouchers, fixtures named `ZZ ...`.
Deleting them table by table is slow and easy to get wrong, because foreign keys
mean the order matters. Starting the schema again is faster and provably complete.

**This account has no terminal.** The only ways in are **phpMyAdmin** and *Setup
Node.js App > Run JS script*, which can run only the scripts already listed in the
deployed `package.json`. That rules out `npx prisma migrate deploy` on the host:
the Prisma CLI is a devDependency and is deliberately not in the bundle. So the
schema arrives as a single SQL file instead.

**This destroys every row in the target database. There is no undo.** Take a
backup first even if you are certain — "certain" and "the wrong database name" are
not mutually exclusive.

With no terminal, take it in phpMyAdmin: select the database in the left sidebar,
*Export* > *Quick* > *SQL* > *Go*, and keep the file it downloads. It is the only
way back if the wrong database gets picked, and it takes seconds.

If you do have remote MySQL access from your own machine — the host has to
whitelist the IP first — `npm run backup` with `DATABASE_URL` pointing at
production does the same thing into `backups/`.

### 1. Build the release schema file

On your machine:

```bash
npm run build:release-sql -- digisof1_schoolpro --reset
```

Two arguments, both of which matter.

**The database name.** phpMyAdmin has two Import tabs that look identical — one on
the server page, one inside a database — and importing from the server page fails
on the very first statement with `#1046 - No database selected`, which reads like
a problem with the file. Naming the database puts a `USE` line at the top so the
file works from either tab.

**`--reset`.** Without it the file creates tables and drops nothing, so importing
it over a database that still holds the tables stops on the first statement with
`#1050 - Table 'users' already exists`. With it the file first drops all 87 tables
this schema owns, then recreates them — so one import turns a database full of
test data into a fresh release schema, and step 2 below becomes unnecessary.

`--reset` is opt-in for a reason: **it destroys every row in the target
database.** The filename says which kind you built —
`release-reset-<database>-<timestamp>.sql` versus
`release-schema-<database>-<timestamp>.sql` — and so does the file's own header,
in capitals. Read the first twenty lines before importing; that is the last point
at which the target is still a decision.

Either file contains the 87 tables exactly as applying all 34
migrations in order would leave them (generated by Prisma from `schema.prisma`,
not hand-written), plus the `_prisma_migrations` table with one row per migration
marked applied with its real checksum.

That last part is what keeps it honest. Without the history the database would
have the right tables and no record of them, and the next `prisma migrate deploy`
would try to apply all 34 over a populated schema and fail.

The drops name every table individually rather than dropping the database, so
anything else living in the same database is left alone. Foreign keys are switched
off for the whole file, so no table has to be dropped before its parent.

Both forms were verified end to end against a local MySQL 8. The plain file was
imported into an empty database **with no database selected**, which is the case
that fails without the `USE` line. The reset file was imported over a database
that already held every table and a row in `users` — the exact `#1050` condition
— after first confirming the plain file failed there.

The table and migration counts above move every time the schema does. Regenerate
the file as the last step before a release, never earlier, and read the counts the
generator prints rather than the ones written here: a file built before the final
migration is wrong by definition. `prisma migrate diff --from-migrations
--to-schema-datamodel` must report *"No difference detected."* first — that is what
makes the generated file the same database the migrations would have built.

Neither file contains a school, users or demo data.

### 2. Drop and recreate the database — only without `--reset`

**Skip this step if you built the file with `--reset`.** It has the drops in it,
so the import replaces the tables by itself and the database, its user and its
privileges are all left as they are.

If you built the plain file, empty the database first: *Databases > MySQL
Databases*, delete it, create it again with **the same name**, and re-add the user
with **ALL PRIVILEGES**. Keeping the name means `DATABASE_URL` in the app settings
does not change, which removes the most common way this goes wrong.

Do not use `prisma migrate reset` for either path. It drops and recreates in one
step, which reads as convenient right up to the moment it is pointed at the wrong
`DATABASE_URL`.

### 3. Import the schema through phpMyAdmin

*phpMyAdmin* > *Import* > choose the `.sql` file > *Go*. The file carries its own
`USE`, so either Import tab works.

Afterwards the sidebar should list **88** tables — the 87 this schema owns plus
`_prisma_migrations`, which should hold one row per migration (34 at the time of
writing; the generator prints the real figure, and that is the one to trust). If
the import stopped partway,
read the error rather than re-running: `#1046` means the file was built without a
database name, and `#1050` means it was built without `--reset` over a database
that still had the tables.

### 4. Confirm it from the application's side

*Setup Node.js App > Run JS script* > **check:cpanel**.

It makes no changes. It should print a connection, `Table count: 88`, and `true`
for the migration, user and school tables. A schema that looks right in
phpMyAdmin but not here means the app is pointed at a different database.

### 5. Create the super admin accounts

*Run JS script* > **seed** (or `seed:super-admin` — both map to
`node seed-super-admin.mjs`).

`SUPER_ADMIN_PASSWORD` and `SECOND_SUPER_ADMIN_PASSWORD` must be set in the app's
environment variables first, at least eight characters each. It creates
`superadmin@schoolpro.ng` and `admin@schoolpro.ng` with hashed credentials and
**nothing else** — no school, no classes, no demo data. That is the correct state
for a release: the first super admin signs in and creates the real school.

It prints `2 created, 0 repaired, 0 already present`. Re-running is safe and
leaves existing passwords alone.

**Then delete both password variables.** They sit in the app configuration in
plain text and are visible to anyone with cPanel access; once the accounts exist
they are not needed again.

### 6. Restart, then sign in

**Restart** from *Setup Node.js App* — Passenger caches the running process, so an
upload or a schema change alone does not take effect. Then sign in at
`/auth/login` as `superadmin@schoolpro.ng` and create the school.

### What not to ship

`npm run seed:demo` builds a full demo school — sessions, terms, classes, 65
learners, fees, payroll, the lot. It is for demonstrating and for local testing,
and it is not in the bundle's script list. Running it against a release database
would give the customer somebody else's learners to delete by hand. If a prospect
needs a populated system to look at, give them a separate database.

## Verifying

1. Load the domain over **https** — AutoSSL is already Active on this account.
2. Sign in at `/auth/login`. A successful sign-in is what proves
   `AUTH_TRUST_HOST` and `NEXTAUTH_URL` are both right. This was reproduced
   against the finished bundle: with `NEXTAUTH_URL` set but `AUTH_TRUST_HOST`
   absent, every `/api/auth/*` request returns **500 `UntrustedHost`** and login
   is impossible; adding the variable returns them to 200.
3. Confirm styling loaded. Unstyled pages mean `.next/static` did not make it up.
4. Upload an avatar, then reload the page it appears on. This is the check for
   `UPLOAD_DIR`: the write proves the path exists and is writable by the app
   user, and the image rendering afterwards proves `/api/files/` can read it back.
   A broken image here usually means `UPLOAD_DIR` points somewhere the Passenger
   process cannot write.
5. Hit `/api/health`. It runs the full production validation — the three
   required variables plus the secret-length and absolute-`UPLOAD_DIR` checks —
   and a `SELECT 1`, so a 200 means the server's own environment and its
   database connection are both sound. A 500 names what is missing.

### Where the environment is checked

Three places, all at runtime:

- `instrumentation.ts` validates once when the process starts and writes any
  failure to the application log. It deliberately does not throw — a missing
  `UPLOAD_DIR` should not take a school offline over a feature most pages never
  touch.
- `/api/health` runs the same check on demand.
- `app/layout.tsx` shows the maintenance page when validation fails, for pages
  rendered per request. It is skipped during `next build`.

That last exclusion is the important one. The root layout is evaluated while
prerendering, so a failure there is written into the HTML of every static page —
the landing page and `/auth/login` among them — and the server then serves that
HTML however the variables are set, because it never re-runs the layout for
those pages. A build on a machine without the production variables produced
exactly that: a site stuck on the maintenance page while `/api/health` reported
healthy. The check now skips when `NEXT_PHASE` is `phase-production-build`, so a
build can no longer decide it.

## Things worth knowing before you commit to this

- **Passenger restarts the process on idle.** The first request after a quiet
  period pays a cold start. That is normal on shared hosting, not a bug.
- **1 GB of memory is the real ceiling.** The app runs in far less at rest, but
  PDF generation (`jspdf`) and large report compilations are the operations most
  likely to approach it. Watch *Resource Usage* after the first month of real
  reporting.
- **Entry Processes is 20.** That is concurrent requests-in-flight, not users. A
  school checking results simultaneously at results time is the scenario that
  would test it.
- If any of the above becomes a problem, this same standalone bundle runs
  unchanged on a small VPS or any Node host — nothing here is cPanel-specific
  except the steps in this file.
