import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner"
import { LoadingProvider } from "@/contexts/loading-context"



const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SchoolPro - Modern School Management System",
  description:
    "The comprehensive platform that helps schools manage students, teachers, classes, and administrative tasks efficiently.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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