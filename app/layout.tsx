// app/layout.tsx (updated)
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner"
import { LoadingProvider } from "@/contexts/loading-context"
import { validateEnvForProduction } from "@/lib/env-validation";
import MaintenancePage from "./maintenance/page";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SchoolPro - Modern School Management System",
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
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <MaintenancePage />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <LoadingProvider>
          <ThemeProvider>
            <div className="min-h-screen flex items-center justify-center">
              {children}
            </div>
            <Toaster />
          </ThemeProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}