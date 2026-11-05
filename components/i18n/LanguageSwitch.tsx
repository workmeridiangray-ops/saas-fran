import { LOCALES, getLocale, type Locale } from "@/lib/i18n";
import { setLanguage } from "@/app/language";

/** One button per language. Posts to a small action that remembers the choice in a cookie. */
export async function LanguageSwitch({ next = "/" }: { next?: string }) {
  const current = await getLocale();
  return (
    <form className="flex items-center gap-1 text-xs" aria-label="Language">
      <input type="hidden" name="next" value={next} />
      {(Object.keys(LOCALES) as Locale[]).map((l) => (
        <button key={l} formAction={setLanguage.bind(null, l)} lang={l} aria-pressed={l === current} className={`min-h-touch rounded-md px-1.5 ${l === current ? "font-semibold text-ink" : "text-brand underline"}`}>{LOCALES[l]}</button>
      ))}
    </form>
  );
}
