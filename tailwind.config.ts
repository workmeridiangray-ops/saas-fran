import type { Config } from "tailwindcss";
import { color, font, fontSize, radius, shadow, spacing } from "./lib/design/tokens";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    // Replace (not extend) colours so only token colours can be used.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      canvas: color.canvas,
      surface: color.surface,
      sunken: color.sunken,
      line: color.line,
      "line-strong": color.lineStrong,
      ink: color.ink,
      muted: color.muted,
      brand: color.brand,
      "brand-soft": color.brandSoft,
      ok: color.status.ok.fg,
      "ok-bg": color.status.ok.bg,
      warn: color.status.warn.fg,
      "warn-bg": color.status.warn.bg,
      danger: color.status.danger.fg,
      "danger-bg": color.status.danger.bg,
      info: color.status.info.fg,
      "info-bg": color.status.info.bg,
      neutral: color.status.neutral.fg,
      "neutral-bg": color.status.neutral.bg,
    },
    fontFamily: { sans: [...font.sans] },
    fontSize: fontSize as unknown as NonNullable<Config["theme"]>["fontSize"],
    borderRadius: { none: "0", ...radius },
    spacing,
    extend: {
      boxShadow: shadow,
      minHeight: { row: spacing.row, touch: "2.75rem" },
      minWidth: { touch: "2.75rem" },
      maxWidth: { prose: "42rem", form: "40rem" },
    },
  },
  plugins: [],
};

export default config;
