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

// Validate environment variables
let envValid = true;
let envError: Error | null = null;

try {
  if (process.env.NODE_ENV !== 'test') {
    validateEnvForProduction();
  }
} catch (error) {
  console.error('❌ Environment validation failed:', error);
  envValid = false;
  envError = error as Error;
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
