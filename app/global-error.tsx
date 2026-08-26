"use client"

import { useEffect } from "react"

/**
 * Last-resort boundary. This replaces the root layout entirely, so it cannot rely on
 * globals.css, the theme provider, or any component from `components/ui` — everything here
 * is self-contained and inline-styled on purpose. It reaches the user only when the root
 * layout itself fails; ordinary page failures are handled by `app/dashboard/error.tsx`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f4f6f8",
          color: "#141c27",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0d1319 !important; color: #e5eaf1 !important; }
            .ge-card { background: #151d26 !important; border-color: #2a3542 !important; }
            .ge-muted { color: #a2afc0 !important; }
            .ge-button { background: #7faee8 !important; color: #0d1319 !important; }
          }
        `}</style>

        <div
          className="ge-card"
          style={{
            maxWidth: "26rem",
            width: "100%",
            background: "#ffffff",
            border: "1px solid #d3dbe4",
            borderRadius: "8px",
            padding: "2rem 1.75rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 .6rem", fontWeight: 600 }}>
            DigiSchool-Pro couldn&apos;t start
          </h1>
          <p className="ge-muted" style={{ margin: "0 0 1.25rem", color: "#47566a" }}>
            The application failed to load. This is not something you can fix from here —
            please send the reference below to your system administrator.
          </p>
          {error.digest ? (
            <p
              className="ge-muted"
              style={{
                margin: "0 0 1.25rem",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: ".8rem",
                color: "#47566a",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            className="ge-button"
            onClick={reset}
            style={{
              background: "#17457f",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: ".6rem 1.25rem",
              fontSize: ".95rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
