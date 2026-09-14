# Digisoft School Pro on cPanel

## Deployment status

This is a Next.js server application with Prisma/MySQL. It is not a static HTML
export and cannot run by extracting a Windows .next build into a PHP folder.
The app is **built on your machine and uploaded as a finished bundle**
(`npm run build:deploy`), and Passenger's startup file is `server.js`. Building on
this account is not realistic: it has 1 GB of memory against ~200 routes to
compile, and 1 MB/s of I/O against a 987 MB `node_modules`.

`app.cjs` is the entry point for the other approach — installing and building on
the server — and does **not** work with the prebuilt bundle; it fails at startup
on a missing `next` internal. Use `server.js`.

`DEPLOYMENT.md` in the repository root is the authoritative step-by-step guide,
including the Prisma driver-adapter setup. This file records the decisions
specific to this account.

## Hosting settings

The current cPanel application is running Node.js 24.20.0. Keep that version for
this release; changing it while the uploaded physical `node_modules` directory
is in place was rejected by CloudLinux. Select Production.
Use a separate application root, for example `apps/digisoft-school-pro`, under
the account home, outside public_html. Startup file: `server.js`.

Create and use the new subdomain `schoolpro.digisoft.com.ng`. Do not change,
redirect or remove `school.digisoft.com.ng`: its document root contains the old
PHP application and remains available separately. The Node application root should
be `/home/digisof1/apps/digisoft-school-pro`; it must not be placed inside either
domain's public document root.

In cPanel > Domains, create `schoolpro.digisoft.com.ng`, leave **Share document
root** unchecked, and use a dedicated document root under `public_html` (for
example `public_html/schoolpro`). Current cPanel Domains does not allow creating
a document root outside `public_html`. Keep this directory free of application
files and secrets. Then open Setup Node.js App and create
the application with these values:

- Node.js version: 24.20.0 (the existing application setting)
- Application mode: Production
- Application root: `apps/digisoft-school-pro`
- Application URL: `schoolpro.digisoft.com.ng`
- Application startup file: `server.js`

Do not copy this application over the placeholder document root. The Node.js App
screen connects the URL to Passenger. Run AutoSSL for the new domain and confirm
HTTPS before setting the final authentication URL.

## Delivery

Run `npm run build:deploy` locally. It produces `deploy/` containing
`server.js`, the traced `node_modules`, `.next/static`, `public/`, the Prisma
schema and migrations, `@prisma/adapter-mariadb` and its runtime dependencies,
`cpanel-check.mjs`, and `seed-super-admin.mjs`. Zip its **contents** and
extract them into the application root — extracting a zip on the server is far
faster than transferring thousands of files at 1 MB/s.

The generated client sets `engineType = "client"` and uses the MariaDB driver
adapter for application queries. It no longer needs a native Prisma query-engine
library, including the previously configured `PRISMA_QUERY_ENGINE_LIBRARY` path.
After deploying the new bundle, remove that environment variable before restarting
the app. The bundle contains no `.env` and no symlinks; the packaging script
checks both. Use `scripts/zip-deploy.ps1` to make the archive:
Windows PowerShell's own zip tools write backslash entry names, which extract on
Linux as a flat pile of files called `.next\build-manifest.json`.

GitHub can hold the source, but a `git pull` is not a deployment: it does not
install, build, migrate or restart, and building on this account is what the
memory limit rules out. Use the repository for review and history, and this
bundle for releases.

## Database and environment

Create a separate MySQL database and user in cPanel, and grant that user privileges
on the new database. Do not point Prisma migrations at the old PHP application's
database: its schema and data need a separately designed migration.

Set these in cPanel > Setup Node.js App > Environment variables rather than
uploading a `.env` file, so the values never exist as a readable file under the
account (`.env.production.example` is the annotated reference):

- DATABASE_URL: mysql://USER:URL_ENCODED_PASSWORD@localhost:3306/DATABASE
- NEXTAUTH_SECRET: a freshly generated random value, at least 32 characters
- NEXTAUTH_URL: `https://schoolpro.digisoft.com.ng` (no trailing slash)
- AUTH_TRUST_HOST: true when cPanel is the trusted reverse proxy
- UPLOAD_DIR: `/home/digisof1/storage/digisoft-school-pro`

Create the upload folder over SSH before starting the application:

```sh
mkdir -p /home/digisof1/storage/digisoft-school-pro
chmod 700 /home/digisof1/storage/digisoft-school-pro
```

New logos, avatars and expense receipts are stored there and served through the
application with authorization where required. This keeps uploaded files outside
public_html and outside application releases. Do not upload a local .env file or
database dump into public_html. Back up the MySQL database and this upload folder
together; database records refer to files in this folder.

## Check, migrate, and start

Run `check:cpanel` from Setup Node.js App, or `node cpanel-check.mjs` in the
activated app environment, after uploading the new bundle. It uses the same
MariaDB adapter as the app, makes no database changes, and reports connection
status, table count, and whether the migration, user, and school tables exist.
Stop if the database connection fails.

The bundle includes migration files but not the Prisma CLI, which is a local
development dependency. Apply migrations from your local workspace with Prisma
6.19.2 after the host enables remote MySQL access for your IP. Set `DATABASE_URL`
privately with the host's remote MySQL hostname and the production database
credentials for this command. Keep the cPanel app's `localhost` URL unchanged;
`localhost` on your own machine would point to the wrong database:

```sh
npx prisma migrate deploy
npx prisma migrate status
```

If remote MySQL is unavailable, ask the host to run the matching Prisma CLI from
an isolated tooling environment with access to this new database. Confirm no
pending or failed migrations and run the read-only `check:cpanel` again before seeding; the
`_prisma_migrations` table should then be present. Do not use
cPanel's **Run JS Script** for `npx prisma migrate deploy`; it is not bundled and
could trigger an install. There is no application install or build on the server.

Then use the activation command displayed by Setup Node.js App in an SSH session,
change into the application root, and run:

```sh
node seed-super-admin.mjs
```

`seed-super-admin.mjs` is the compiled form of the same seed logic, included in the bundle because the host
cannot run TypeScript through `tsx`.

Before seeding, set SUPER_ADMIN_PASSWORD and SECOND_SUPER_ADMIN_PASSWORD (at
least eight characters each) in the private environment. The seed creates
`superadmin@schoolpro.ng` and `admin@schoolpro.ng`, including profiles and
hashed credentials. It creates no schools or demo data and deletes nothing.
A repeat run preserves matching accounts and passwords; an incompatible account
with either email stops the seed. The deployed package also makes cPanel's
`seed` and `seed:super-admin` menu items run the compiled Node script rather
than unavailable `tsx`. Remove both password variables after setup.
Never run seed:demo on production. Restart using Setup Node.js App, log in as
super admin, and create the first real school through the application.

Sign-in lives at `/auth/login`. If `/api/auth/*` returns 500, check
`AUTH_TRUST_HOST=true` — without it Auth.js rejects the proxied Host header as
`UntrustedHost` and every sign-in fails. This was reproduced against the bundle.

## Acceptance

Verify HTTPS, login/logout, role restrictions, database reads and writes, logo and
avatar uploads, receipt uploads, report exports and restart persistence. Check server
logs for missing configuration and database errors. Full acceptance needs real
hosting access and a configured test account.

Keep the Node application mapped to `schoolpro.digisoft.com.ng`. The existing
`school.digisoft.com.ng` PHP files and database are not part of this deployment and
must remain untouched. The product display name remains **Digisoft School Pro**.
