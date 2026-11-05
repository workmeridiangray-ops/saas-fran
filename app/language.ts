"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

export async function setLanguage(locale: string, f: FormData) {
  if (!isLocale(locale)) redirect("/");
  (await cookies()).set("nm_lang", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  const next = String(f.get("next") ?? "/"); redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
