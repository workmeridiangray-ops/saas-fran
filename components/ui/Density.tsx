"use client";
import { useEffect, useState } from "react";

/** Comfortable or compact table rows, remembered on this device. Everything stays at least 44px high on phones. */
export function Density() {
  const [d, setD] = useState<"comfortable" | "compact">("comfortable");
  useEffect(() => { try { const v = localStorage.getItem("nm:density"); if (v === "compact") { setD("compact"); document.documentElement.dataset.density = "compact"; } } catch { /* ignore */ } }, []);
  const set = (v: "comfortable" | "compact") => { setD(v); document.documentElement.dataset.density = v; try { localStorage.setItem("nm:density", v); } catch { /* ignore */ } };
  return (
    <button type="button" onClick={() => set(d === "compact" ? "comfortable" : "compact")} aria-pressed={d === "compact"} title="Switch table density" className="hidden min-h-touch items-center rounded-md border border-line px-1.5 text-xs text-muted hover:bg-sunken md:inline-flex">
      {d === "compact" ? "Compact rows" : "Comfortable rows"}
    </button>
  );
}
