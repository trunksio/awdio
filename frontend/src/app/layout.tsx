import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Awdio - Voice-Driven Podcasts",
  description: "Interactive podcasts you can interrupt and question",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
