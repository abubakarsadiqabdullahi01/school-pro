// cPanel / CloudLinux Passenger startup file (CommonJS despite package type=module).
//
// NOTE: this entry point requires a full `npm ci` + `npm run build` ON the server,
// because it calls next() programmatically. It does NOT work with the prebuilt
// bundle from `npm run build:deploy`: standalone output traces only part of the
// `next` package, so this fails at startup with
//   Cannot find module 'next/dist/compiled/webpack/webpack-lib'
// (verified against the bundle). For the standalone bundle — the approach
// DEPLOYMENT.md documents, and the only one that fits a 1 GB memory limit — set
// Passenger's startup file to `server.js` instead.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const http = require('node:http');
const next = require('next');

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch((error) => {
      console.error('Request failed', error);
      if (!res.headersSent) res.statusCode = 500;
      res.end('Internal server error');
    });
  });
  server.on('error', (error) => {
    console.error('Server failed', error);
    process.exit(1);
  });
  // Passenger intercepts listen(); PORT also permits a standalone smoke test.
  server.listen(process.env.PORT || 3000);
}).catch((error) => {
  console.error('Next.js startup failed', error);
  process.exit(1);
});
