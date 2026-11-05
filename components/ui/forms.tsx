"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending = "Saving…", variant = "primary", className = "" }: {
  children: React.ReactNode; pending?: string; variant?: "primary" | "secondary" | "danger"; className?: string;
}) {
  const { pending: busy } = useFormStatus();
  const v = { primary: "bg-brand text-white hover:bg-[#172E6E]", secondary: "border border-line-strong bg-surface hover:bg-sunken", danger: "border border-danger bg-surface text-danger hover:bg-danger-bg" }[variant];
  return (
    <button type="submit" disabled={busy} aria-disabled={busy}
      className={`inline-flex min-h-touch items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${v} ${className}`}>
      {busy ? pending : children}
    </button>
  );
}
