"use client";
import { useEffect } from "react";

/**
 * Two promises, for every form in the app:
 *  1. If a submission fails, what you typed is still there when the page comes back with the error.
 *  2. Leaving a page with edits you haven't submitted asks first.
 * Passwords and files are never remembered. Search and filter forms (role="search") are ignored.
 */
const KEY = "nm:form:";
const isWorkForm = (f: HTMLFormElement) => f.getAttribute("role") !== "search" && (f.method === "post" || !!f.querySelector("[formaction]") || (f.getAttribute("action") ?? "").startsWith("javascript"));
const fields = (f: HTMLFormElement) => [...f.elements].filter((e): e is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) && !!e.name && !e.name.startsWith("$") && e.type !== "password" && e.type !== "file" && e.type !== "hidden" && e.type !== "submit");
const sig = (f: HTMLFormElement, i: number) => `${KEY}${location.pathname}:${i}:${fields(f).map((e) => e.name).join(",")}`;

export function Remember() {
  useEffect(() => {
    let dirty = false; let submitting = false;
    const forms = () => [...document.forms].filter(isWorkForm);
    try {
      const failed = new URLSearchParams(location.search).has("err");
      forms().forEach((f, i) => {
        const raw = sessionStorage.getItem(sig(f, i)); if (!raw) return;
        if (failed) { const saved = JSON.parse(raw) as Record<string, string | string[]>; for (const e of fields(f)) { const v = saved[e.name]; if (v === undefined) continue;
          if (e instanceof HTMLInputElement && (e.type === "checkbox" || e.type === "radio")) e.checked = Array.isArray(v) ? v.includes(e.value) : v === e.value; else if (!Array.isArray(v)) e.value = v; } }
        sessionStorage.removeItem(sig(f, i));
      });
    } catch { /* storage unavailable: forms simply start empty */ }
    const onInput = (ev: Event) => { const f = (ev.target as HTMLElement).closest("form"); if (f && isWorkForm(f)) dirty = true; };
    const onSubmit = (ev: Event) => {
      submitting = true; const f = ev.target as HTMLFormElement; if (!isWorkForm(f)) return;
      try { const i = forms().indexOf(f); const data: Record<string, string | string[]> = {};
        for (const e of fields(f)) { if (e instanceof HTMLInputElement && (e.type === "checkbox" || e.type === "radio")) { if (e.checked) { const cur = data[e.name]; data[e.name] = cur === undefined ? e.value : [...(Array.isArray(cur) ? cur : [cur]), e.value]; } } else data[e.name] = e.value; }
        sessionStorage.setItem(sig(f, i), JSON.stringify(data)); } catch { /* ignore */ }
    };
    const onLeave = (ev: BeforeUnloadEvent) => { if (dirty && !submitting) { ev.preventDefault(); ev.returnValue = ""; } };
    document.addEventListener("input", onInput); document.addEventListener("submit", onSubmit, true); window.addEventListener("beforeunload", onLeave);
    const reset = () => { submitting = false; }; window.addEventListener("pageshow", reset);
    return () => { document.removeEventListener("input", onInput); document.removeEventListener("submit", onSubmit, true); window.removeEventListener("beforeunload", onLeave); window.removeEventListener("pageshow", reset); };
  }, []);
  return null;
}
