// Runs once when a server process starts — at runtime, never during `next build`.
//
// The root layout cannot be the place a bad deploy announces itself: it is
// evaluated while prerendering, so anything it decides about the environment is
// baked into static HTML rather than reflecting the machine actually serving
// the app. This hook sees the real environment, and writes the failure to the
// application log (stderr.log under the app root on cPanel/Passenger).
//
// It deliberately does not throw. Refusing to boot would take a working school
// down over, say, a missing UPLOAD_DIR, when most of the app does not touch
// uploads. /api/health is the endpoint that reports the same problem on demand.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { validateEnvForProduction } = await import('@/lib/env-validation')

  try {
    validateEnvForProduction()
  } catch (error) {
    console.error(
      '❌ Environment validation failed at startup:',
      error instanceof Error ? error.message : error
    )
    console.error(
      'The server is running with an incomplete environment. Check the variables on the Node.js application, then restart it. /api/health reports the same check.'
    )
  }
}
