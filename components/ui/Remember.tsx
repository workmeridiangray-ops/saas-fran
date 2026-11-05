"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Two promises, for every form in the app:
 *  1. If a submission fails, what you typed is still there when the page comes back with the error.
 *  2. Leaving a page with edits you haven't submitted asks first.
 * Passwords and files are never remembered. Search and filter forms (role="search") are ignored.
 */
const KEY = "nm:form:";
const isWorkForm = (f: HTMLFormElement) => f.getAttribute("role") !== "search" && (f.method === "post" || !!f.querySelector("[formaction]") || (f.getAttribute("action") ?? "").startsWith("javascript"));
const fields = (f: HTMLFormElement) => [...f.elements].filter((e): e is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) && !!e.name && !e.name.startsWith("$") && e.type !== "password" && e.type !== "file" && e.type !== "hidden" && e.type !== "submit");
// Keyed by page and field names, not position: an error banner can shift which index a form has.
const sig = (f: HTMLFormElement) => `${KEY}${location.pathname}:${fields(f).map((e) => e.name).join(",")}`;

export function Remember() {
  const path = usePathname(); const search = useSearchParams().toString();
  // Runs on every navigation, not just the first load: a failed save comes back as a client-side transition.
  useEffect(() => {
    if (!new URLSearchParams(search).has("err")) {
      // A clean page: drop anything left over for the forms on it.
      try { [...document.forms].filter(isWorkForm).forEach((f) => sessionStorage.removeItem(sig(f))); } catch { /* ignore */ }
      return;
    }
    // The failed page's form may not be in the DOM yet when the URL changes, and React resets a form once its
    // action settles. So keep looking for a short while and apply the saved values whenever a form shows up.
    const done = new Set<string>(); let ticks = 0;
    let typed = false; const stop = () => { typed = true; }; document.addEventListener("input", stop, true); document.addEventListener("change", stop, true);
    const apply = () => {
      if (typed) return;
      try {
        for (const f of [...document.forms].filter(isWorkForm)) {
          const key = sig(f); const raw = sessionStorage.getItem(key); if (!raw) continue;
          const saved = JSON.parse(raw) as Record<string, string | string[]>;
          for (const e of fields(f)) { const v = saved[e.name]; if (v === undefined) continue;
            if (e instanceof HTMLInputElement && (e.type === "checkbox" || e.type === "radio")) e.checked = Array.isArray(v) ? v.includes(e.value) : v === e.value; else if (!Array.isArray(v) && e.value !== v) e.value = v; }
          done.add(key);
        }
      } catch { /* storage unavailable: forms simply start empty */ }
    };
    const timer = setInterval(() => { apply(); if (++ticks > 30) { clearInterval(timer); done.forEach((k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }); } }, 100);
    apply();
    return () => { clearInterval(timer); document.removeEventListener("input", stop, true); document.removeEventListener("change", stop, true); };
  }, [path, search]);

  useEffect(() => {
    let dirty = false; let submitting = false;
    const forms = () => [...document.forms].filter(isWorkForm);
    const onInput = (ev: Event) => { const f = (ev.target as HTMLElement).closest("form"); if (f && isWorkForm(f)) dirty = true; };
    const onSubmit = (ev: Event) => {
      submitting = true; const f = ev.target as HTMLFormElement; if (!isWorkForm(f)) return;
      try { const data: Record<string, string | string[]> = {};
        for (const e of fields(f)) { if (e instanceof HTMLInputElement && (e.type === "checkbox" || e.type === "radio")) { if (e.checked) { const cur = data[e.name]; data[e.name] = cur === undefined ? e.value : [...(Array.isArray(cur) ? cur : [cur]), e.value]; } } else data[e.name] = e.value; }
        // Only the form being submitted is remembered; older entries would be stale.
        for (let k = sessionStorage.length - 1; k >= 0; k--) { const n = sessionStorage.key(k); if (n?.startsWith(KEY)) sessionStorage.removeItem(n); }
        sessionStorage.setItem(sig(f), JSON.stringify(data)); } catch { /* ignore */ }
    };
    const onLeave = (ev: BeforeUnloadEvent) => { if (dirty && !submitting) { ev.preventDefault(); ev.returnValue = ""; } };
    document.addEventListener("input", onInput); document.addEventListener("submit", onSubmit, true); window.addEventListener("beforeunload", onLeave);
    const reset = () => { submitting = false; }; window.addEventListener("pageshow", reset);
    return () => { document.removeEventListener("input", onInput); document.removeEventListener("submit", onSubmit, true); window.removeEventListener("beforeunload", onLeave); window.removeEventListener("pageshow", reset); };
  }, []);
  return null;
}
