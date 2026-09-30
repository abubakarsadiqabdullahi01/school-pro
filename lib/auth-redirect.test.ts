import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import type { Session } from "next-auth"
import { authConfig } from "../auth.config"

// A signed JWT can outlive its database account, revoked session, or idle timeout.
// The login screen must remain reachable after authActive rejects that JWT.
describe("authentication redirect recovery", () => {
  const staleSession = { user: { id: "deleted-user" }, expires: "2099-01-01" } as Session
  const check = (path: string, auth: Session | null) =>
    authConfig.callbacks.authorized({ auth, request: new NextRequest(`https://school.example${path}`) })

  it("allows login even when a stale cookie contains a user", () => {
    expect(check("/auth/login", staleSession)).toBe(true)
  })

  it("allows login without a session", () => {
    expect(check("/auth/login", null)).toBe(true)
  })

  it("still redirects unauthenticated dashboard requests to login", () => {
    const result = check("/dashboard", null) as Response
    expect(result.headers.get("location")).toBe("https://school.example/auth/login")
  })

  it("leaves database-backed dashboard authorization to the layout", () => {
    expect(check("/dashboard", staleSession)).toBe(true)
  })
})
