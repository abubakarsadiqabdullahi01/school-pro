// app/layout.tsx (updated)
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner"
import { LoadingProvider } from "@/contexts/loading-context"
import { validateEnvForProduction } from "@/lib/env-validation";
import MaintenancePage from "./maintenance/page";

// globals.css maps --font-sans / --font-mono onto these two variables. Without
// them defined, every screen silently fell back to the OS UI font.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DigiSchool-Pro - Modern School Management System",
  description:
    "The comprehensive platform that helps schools manage students, teachers, classes, and administrative tasks efficiently.",
};

// Environment validation runs at request time, never while building.
//
// This module is evaluated during prerendering as well as at runtime, so a
// failure here used to be frozen into the HTML of every statically prerendered
// page — the landing page and /auth/login among them. A deploy built on a
// machine without the production variables then served the maintenance page
// forever, and no correction on the server could clear it, because the server
// never re-runs this code for those pages. `next build` sets NEXT_PHASE; the
// standalone server does not, so this check only ever sees the real
// environment. Statically prerendered pages are consequently not gated at all;
// instrumentation.ts logs the failure at startup and /api/health reports it.
let envValid = true;

if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
  try {
    validateEnvForProduction();
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    envValid = false;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Show maintenance page if environment validation failed
  if (!envValid) {
    return (
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <body className="font-sans antialiased">
          <MaintenancePage />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <LoadingProvider>
          <ThemeProvider>
            {/* No centring wrapper here: it vertically centred the whole
                dashboard shell on short pages. Every standalone page
                (login, error, maintenance, access-error) centres itself. */}
            {children}
            <Toaster />
          </ThemeProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}
