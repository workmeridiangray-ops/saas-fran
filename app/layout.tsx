import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Suspense } from "react";
import { Remember } from "@/components/ui/Remember";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: { default: "Network Manager", template: "%s · Network Manager" },
  description: "Multi-company management for franchises, branches and outlets.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans text-base antialiased">{children}<Suspense fallback={null}><Remember /></Suspense></body>
    </html>
  );
}
