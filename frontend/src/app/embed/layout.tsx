import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Awdio Embed",
  description: "Embedded interactive presentation",
};

export default function EmbedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Minimal layout for embeds - no auth wrapper, no navigation
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
