// Assembles a self-contained upload bundle for cPanel / Passenger hosting.
//
// `output: 'standalone'` gives us .next/standalone with server.js and the traced
// dependencies, but Next deliberately leaves two things out of it: .next/static
// and public/. Without them the app boots and serves HTML with no CSS, no JS and
// no images. This script builds, assembles the pieces in the layout Passenger
// expects, and reports the size — the account this targets has ~6 GB free and
// 1 MB/s of I/O, so the size is the number that decides whether an upload is
// realistic. See DEPLOYMENT.md.

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const out = path.join(root, "deploy")

function run(cmd) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: "inherit", cwd: root })
}

// dereference: Next leaves symlinks in standalone output — notably
// .next/node_modules/@prisma/client-<hash>, which points at an ABSOLUTE path on
// this machine. Copied as a link it is dangling the moment it lands on the
// server, and Prisma fails to resolve. Following them here means the bundle is
// real files only, and stays correct whatever tool uploads or extracts it.
function copyDir(from, to) {
  if (!fs.existsSync(from)) return false
  fs.cpSync(from, to, { recursive: true, dereference: true })
  return true
}

// Next's standalone trace can omit the adapter used by scripts outside Next
// (notably seed-super-admin.mjs). Copy the adapter and its runtime dependency
// tree, preserving npm's nested node_modules layout when versions differ.
const sourceModules = path.join(root, "node_modules")
function resolveRuntimePackage(name, fromDir) {
  for (let dir = fromDir; dir.startsWith(root); dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name)
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate
    if (dir === root) break
  }
  throw new Error(`Cannot find runtime package ${name} required by ${fromDir}`)
}

function copyRuntimePackage(name, fromDir, seen = new Set()) {
  const source = resolveRuntimePackage(name, fromDir)
  if (seen.has(source)) return
  seen.add(source)
  const relative = path.relative(sourceModules, source)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Runtime package is outside node_modules: ${source}`)
  }
  const destination = path.join(out, "node_modules", relative)
  copyDir(source, destination)
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"))
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    // Type declarations are not needed by Node on the cPanel host.
    if (!dependency.startsWith("@types/")) copyRuntimePackage(dependency, source, seen)
  }
}

// Walked explicitly rather than with readdirSync({ recursive: true }): the
// parentPath on those dirents resolved wrongly here and inflated the total by
// roughly half (227 MB reported against 153 MB actual, cross-checked with du and
// find). This number is what decides whether an upload is realistic at 1 MB/s,
// so it has to be right. lstat, not stat, so a symlink counts as itself.
function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else total += fs.lstatSync(full).size
  }
  return total
}

// 1. Build. `prisma generate` first, matching the normal build script — the
//    generated client is what gets traced into standalone.
run("npx prisma generate")
run("npx next build")

const standalone = path.join(root, ".next", "standalone")
if (!fs.existsSync(standalone)) {
  console.error(
    "\n.next/standalone was not created. Check that next.config.ts still sets output: 'standalone'."
  )
  process.exit(1)
}

// 2. Assemble. Start clean so a stale bundle can never be uploaded by mistake.
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

copyDir(standalone, out)
copyDir(path.join(root, ".next", "static"), path.join(out, ".next", "static"))
copyDir(path.join(root, "public"), path.join(out, "public"))
copyRuntimePackage("@prisma/adapter-mariadb", root)

// cPanel's Run JS Script menu reads package.json from the uploaded bundle.
// The local seed commands use tsx, but production installs no dev dependencies.
// Point the production menu at the compiled Node entry point instead.
const runtimePackagePath = path.join(out, "package.json")
const runtimePackage = JSON.parse(fs.readFileSync(runtimePackagePath, "utf8"))
runtimePackage.scripts.seed = "node seed-super-admin.mjs"
runtimePackage.scripts["seed:super-admin"] = "node seed-super-admin.mjs"
delete runtimePackage.scripts["seed:demo"]
fs.writeFileSync(runtimePackagePath, JSON.stringify(runtimePackage, null, 2) + "\n")

// 3. Include the Prisma schema and migration history for release review and
//    migration execution from a separate environment with the Prisma CLI.
copyDir(path.join(root, "prisma", "migrations"), path.join(out, "prisma", "migrations"))
fs.copyFileSync(path.join(root, "prisma", "schema.prisma"), path.join(out, "prisma", "schema.prisma"))

// 3b. The super-admin seed, compiled to plain JS. prisma/seed.ts runs through
//     `tsx` locally, but tsx is a devDependency and the host cannot execute
//     TypeScript, so without this there is no way to create the first account on
//     a fresh database. @prisma/client and @prisma/adapter-mariadb stay external
//     because their runtime packages are present in node_modules; bcryptjs is
//     bundled in, as Next compiles it into .next/server chunks rather than
//     leaving it importable.
run(
  "npx esbuild ./scripts/seed-super-admin.entry.ts --bundle --platform=node --target=node20 " +
    `--format=esm --external:@prisma/client --external:@prisma/adapter-mariadb --outfile="${path.join(out, "seed-super-admin.mjs")}"`
)

// 3c. A read-only host check uses the same adapter path as the application and
//     seed. Compile it here so cPanel can run it with plain Node and no install.
run(
  "npx esbuild ./scripts/cpanel-check.entry.ts --bundle --platform=node --target=node20 " +
    `--format=esm --external:@prisma/client --external:@prisma/adapter-mariadb --outfile="${path.join(out, "cpanel-check.mjs")}"`
)

// 4. Passenger looks for a startup file it was configured with. server.js from
//    standalone is already exactly that, but it defaults to port 3000; Passenger
//    supplies its own PORT, which server.js reads, so no wrapper is needed.
if (!fs.existsSync(path.join(out, "server.js"))) {
  console.error("\nserver.js missing from the bundle — the standalone output looks incomplete.")
  process.exit(1)
}

// 5. Scrub. Next copies .env files into standalone by design, and the tracer
//    can sweep in project files that are not runtime code. Uploading either is
//    how live credentials end up on a shared host, so remove them here and then
//    refuse to report success if anything sensitive survived.
const scrub = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.example",
  "deploy",
  "outputs",
  "storage",
  "test",
  "tmp",
  "documentation",
  ".git",
  "tsconfig.tsbuildinfo",
  // app.cjs is the entry for building on the server; against this bundle it
  // crashes on a missing next/ internal. Leaving it here only invites picking
  // the wrong Passenger startup file. server.js is the one that works.
  "app.cjs",
]
for (const entry of scrub) {
  fs.rmSync(path.join(out, entry), { recursive: true, force: true })
}

// engineType = "client" uses the MariaDB driver adapter for application queries.
// Remove any stale native query-engine copies left by an earlier standalone build.
const generatedClientDir = path.join(out, "node_modules", ".prisma", "client")
if (fs.existsSync(generatedClientDir)) {
  for (const name of fs.readdirSync(generatedClientDir)) {
    if (/^(lib)?query_engine[-_].*\.node$/.test(name) || /\.node\.tmp\d+$/.test(name)) {
      fs.rmSync(path.join(generatedClientDir, name), { force: true })
    }
  }
}

for (const name of ["@prisma/adapter-mariadb", "mariadb", "@prisma/driver-adapter-utils"]) {
  if (!fs.existsSync(path.join(out, "node_modules", name, "package.json"))) {
    throw new Error(`Missing adapter runtime package in deploy bundle: ${name}`)
  }
}

const leaked = fs
  .readdirSync(out, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && /^\.env($|\.)/.test(entry.name))
  .map((entry) => path.relative(out, path.join(entry.parentPath ?? entry.path, entry.name)))
if (leaked.length) {
  console.error(`\nRefusing to finish: env files are still in the bundle:`)
  for (const file of leaked) console.error(`  ${file}`)
  process.exit(1)
}

// cpSync's `dereference` does not reliably follow symlinks nested inside the
// tree being copied, so replace whatever is left by hand: read the link, then
// copy the real target over the top of it. Repeated until none remain, since a
// materialised target can itself contain links.
function materializeLinks(dir) {
  let replaced = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(full)
      fs.rmSync(full, { recursive: true, force: true })
      fs.cpSync(target, full, { recursive: true, dereference: true })
      replaced++
    } else if (entry.isDirectory()) {
      replaced += materializeLinks(full)
    }
  }
  return replaced
}
for (let pass = 0; pass < 5; pass++) {
  if (materializeLinks(out) === 0) break
}

// A symlink that survived would point somewhere that does not exist on the
// server, so treat any as a packaging failure rather than shipping it.
function findLinks(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) found.push(path.relative(out, full))
    else if (entry.isDirectory()) found.push(...findLinks(full))
  }
  return found
}
const links = findLinks(out)
if (links.length) {
  console.error(`\nRefusing to finish: symlinks in the bundle would dangle on the server:`)
  for (const link of links.slice(0, 10)) console.error(`  ${link}`)
  process.exit(1)
}

const mb = (dirSize(out) / 1024 / 1024).toFixed(0)
console.log(`\nBundle ready: deploy/  (${mb} MB)`)
console.log("Upload its CONTENTS (not the folder itself) to the app root on the server.")
console.log("No .env is included by design — set the variables in cPanel's Node.js app UI.")
