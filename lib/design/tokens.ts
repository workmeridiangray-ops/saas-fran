/**
 * Single source of truth for colour, type and spacing (brief B1/B2).
 * tailwind.config.ts consumes this; tokens.test.ts proves WCAG AA.
 * Company branding may only change `brand` and `brandSoft`, and only to a
 * value that passes `isAcceptableBrand` in ./contrast.ts.
 */
export const color = {
  canvas: "#FAF8F5", // warm white page background
  surface: "#FFFFFF",
  sunken: "#F3F1ED", // subtle grey surface
  line: "#E3DFD8",
  lineStrong: "#CFCAC1",
  ink: "#1F2328", // charcoal text
  muted: "#565B62",
  brand: "#1E3A8A", // deep blue, the one accent
  brandSoft: "#E8EDF8",
  focus: "#1E3A8A",
  status: {
    ok: { fg: "#14532D", bg: "#E6F4EA" },
    warn: { fg: "#7A4A00", bg: "#FFF3DC" },
    danger: { fg: "#8F1D1D", bg: "#FCE9E7" },
    info: { fg: "#1E40AF", bg: "#E6EEFB" },
    neutral: { fg: "#3F444B", bg: "#EEEBE6" },
  },
} as const;

export const font = {
  sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
} as const;

/** 8-point scale: Tailwind's `p-2` = 16px, `gap-1` = 8px. Replaces Tailwind's default scale. */
export const spacing = {
  0: "0",
  px: "1px",
  0.5: "0.25rem",
  1: "0.5rem",
  1.5: "0.75rem",
  2: "1rem",
  3: "1.5rem",
  4: "2rem",
  5: "2.5rem",
  6: "3rem",
  8: "4rem",
  row: "2.75rem",
} as const;

export const fontSize = {
  xs: ["0.75rem", { lineHeight: "1rem" }],
  sm: ["0.875rem", { lineHeight: "1.5rem" }],
  base: ["1rem", { lineHeight: "1.5rem" }],
  lg: ["1.125rem", { lineHeight: "1.75rem" }],
  xl: ["1.375rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
  "2xl": ["1.75rem", { lineHeight: "2.5rem", letterSpacing: "-0.015em" }],
} as const;

export const radius = { sm: "0.25rem", md: "0.5rem", lg: "0.75rem", full: "9999px" } as const;

export const shadow = {
  raised: "0 1px 2px rgba(31,35,40,0.06), 0 1px 1px rgba(31,35,40,0.04)",
  overlay: "0 8px 24px rgba(31,35,40,0.12), 0 2px 6px rgba(31,35,40,0.06)",
} as const;
