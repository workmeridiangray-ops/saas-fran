/** Fail fast with a readable message instead of a stack trace deep in a request. */
export function env() {
  const e = {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    APP_URL: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    SMTP_URL: process.env.SMTP_URL ?? "",
    MAIL_FROM: process.env.MAIL_FROM ?? "Network Manager <no-reply@localhost>",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
    PROD: process.env.NODE_ENV === "production",
  };
  if (!e.DATABASE_URL) throw new Error("DATABASE_URL is not set. See .env.example.");
  return e;
}
