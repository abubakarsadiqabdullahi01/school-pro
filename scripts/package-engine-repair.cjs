// Download the exact engine version used by the uploaded Prisma client.
const fs = require('node:fs');
const path = require('node:path');
const { download, BinaryType } = require('@prisma/fetch-engine');
const { enginesVersion } = require('@prisma/engines-version');
const target = 'debian-openssl-1.0.x';
const root = path.resolve(__dirname, '..');
const client = require(path.join(root, 'deploy/node_modules/.prisma/client'));
if (client.Prisma.prismaVersion.engine !== enginesVersion) {
  throw new Error('Engine version differs from the uploaded bundle; refusing repair.');
}
const output = path.join(root, 'outputs', 'cpanel-engine-repair', 'prisma');
fs.mkdirSync(output, { recursive: true });
download({
  binaries: { [BinaryType.QueryEngineLibrary]: output },
  binaryTargets: [target],
  version: enginesVersion,
  showProgress: true,
}).then(() => {
  const file = path.join(output, `libquery_engine-${target}.so.node`);
  const handle = fs.openSync(file, 'r');
  const magic = Buffer.alloc(4);
  fs.readSync(handle, magic, 0, 4, 0);
  fs.closeSync(handle);
  if (!magic.equals(Buffer.from([127, 69, 76, 70]))) throw new Error('Not a Linux ELF binary');
  console.log(`Verified Linux engine for Prisma ${client.Prisma.prismaVersion.client}: ${file}`);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
