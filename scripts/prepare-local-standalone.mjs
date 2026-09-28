import { cpSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()
const standalone = resolve(root, ".next", "standalone")

if (!existsSync(resolve(standalone, "server.js"))) {
  throw new Error("Standalone build is missing. Run `npm run build` first.")
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) return
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
}

copyDirectory(resolve(root, ".next", "static"), resolve(standalone, ".next", "static"))
copyDirectory(resolve(root, "public"), resolve(standalone, "public"))

console.info("Standalone static and public assets are ready.")
