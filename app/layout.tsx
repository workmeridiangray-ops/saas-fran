import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Network Manager", template: "%s · Network Manager" },
  description: "Multi-company management for franchises, branches and outlets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-base antialiased">{children}</body>
    </html>
  );
}
