/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // dependencies actually traced. Needed for cPanel/Passenger, where the
  // account has ~6 GB of disk and 1 MB/s of I/O — a full node_modules
  // install on the server is not viable. See DEPLOYMENT.md.
  output: 'standalone',
  // The dynamic fs paths in lib/local-storage.ts defeat static tracing, so the
  // tracer falls back to sweeping the project root — which pulled deploy/,
  // outputs/, test/ and tmp/ into the bundle and made each build nest the
  // previous one. Nothing listed here is reachable at runtime.
  outputFileTracingExcludes: {
    '**': [
      './deploy/**',
      './outputs/**',
      './storage/**',
      './test/**',
      './tmp/**',
      './documentation/**',
      './scripts/**',
      './.git/**',
      './.next/cache/**',
      './**/*.test.ts',
      './**/*.test.tsx',
      './tsconfig.tsbuildinfo',
    ],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 't3.storage.dev',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/uploads/**',
      },
    ],
  },
}

export default nextConfig
