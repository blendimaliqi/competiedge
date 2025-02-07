import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LoginButton } from "@/components/auth/login-button";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "CompetieEdge - Competitor Website Monitoring",
  description: "Monitor your competitors' websites for new content and updates",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <AuthProvider>
            <div className="flex flex-col min-h-screen">
              <header className="border-b">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                  <h1 className="text-xl font-semibold">CompetieEdge</h1>
                  <LoginButton />
                </div>
              </header>
              <main className="flex-1">{children}</main>
            </div>
          </AuthProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
