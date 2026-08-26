import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. This file used to be a disabled stub
 * that returned an empty 200 with `matcher: []`, so nothing was gated at the edge at all.
 *
 * What runs here is only the coarse check: is there a session, and should a signed-in user
 * be bounced off the login page. That logic already lives in `authConfig.callbacks.authorized`.
 *
 * Role checks deliberately do NOT run here. They need the user's profile and school, which
 * means Prisma, which does not run on the edge — and a role in a JWT is a cached claim, not
 * the current truth. Roles are enforced by a `layout.tsx` in each role subtree under
 * `app/dashboard/(roles)`, which are server components with database access. Treat this as
 * the outer door and those as the locks.
 *
 * `authConfig` is the Prisma-free half of the auth setup precisely so it can be imported
 * here; do not import from `@/auth`, which pulls in the adapter.
 */
export default NextAuth(authConfig).auth

export const config = {
  // Scoped tightly on purpose. A broad matcher would put every static asset and API route
  // through the auth check for no benefit, and risks interfering with the auth routes
  // themselves.
  matcher: ["/dashboard/:path*", "/auth/login"],
}
