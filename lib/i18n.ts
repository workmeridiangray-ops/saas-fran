import { cookies } from "next/headers";
import { ES } from "@/lib/i18n-es";

export const LOCALES = { en: "English", es: "Español" } as const;
export type Locale = keyof typeof LOCALES;
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && v in LOCALES;

export async function getLocale(): Promise<Locale> {
  try { const v = (await cookies()).get("nm_lang")?.value; return isLocale(v) ? v : "en"; } catch { return "en"; }
}
/** Translate an English string. Anything without a translation stays in English, never blank. */
export function tr(locale: Locale, text: string): string { return locale === "es" ? ES[text] ?? text : text; }
export async function getT(): Promise<{ locale: Locale; t: (text: string) => string }> { const locale = await getLocale(); return { locale, t: (s) => tr(locale, s) }; }
