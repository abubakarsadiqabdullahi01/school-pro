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

### Check the database, then apply migrations

After uploading the new bundle, run `check:cpanel` from Setup Node.js App, or
`node cpanel-check.mjs` in the activated app environment. The bundled check uses
the MariaDB adapter and reports connection status, table count, and whether the
migration, user, and school tables exist. It makes no changes. Stop if it cannot
connect; a successful native library load from the old diagnostic is not a
database connection check.

The upload contains `prisma/schema.prisma` and `prisma/migrations`, but it does
not contain the Prisma CLI: that is a local development dependency. Do not run
`npx prisma migrate deploy` through cPanel's **Run JS Script** button; it is not
an npm script in the bundle and `npx` may attempt an install on this constrained
account. Apply migrations from your local workspace after the host enables
remote MySQL access for your IP. In a private shell, point `DATABASE_URL` at the
host's remote MySQL hostname with the production database name and credentials;
`localhost` in the cPanel app setting would refer to your own machine if copied
unchanged. Leave the cPanel app's `localhost` URL as it is:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

If remote MySQL is unavailable, ask the hosting provider to run the same command
with the matching Prisma CLI in an isolated tooling environment that can access
the new database. Confirm the CLI reports no pending or failed migrations, then
run `check:cpanel` again and confirm the migration table is present before
seeding. `migrate deploy` only applies pending migrations and does not reset data;
do not use `migrate dev` against production.

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
