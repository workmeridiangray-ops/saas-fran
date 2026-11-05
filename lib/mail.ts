import nodemailer from "nodemailer";
import { asService } from "@/lib/db";
import { env } from "@/lib/env";

/** Every message is recorded in identity.outbox; it is also sent when SMTP_URL is set (dev and tests read the outbox). */
export async function sendMail(to: string, subject: string, body: string, attachments: { filename: string; content: string }[] = []): Promise<void> {
  const id = await asService(async (db) => (await db.one<{ id: string }>("insert into identity.outbox(to_email, subject, body) values ($1,$2,$3) returning id", [to, subject, body + attachments.map((a) => `\n\n[attachment ${a.filename}, ${a.content.length} bytes]`).join("")]))!.id);
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL) return;
  try {
    await nodemailer.createTransport(SMTP_URL).sendMail({ from: MAIL_FROM, to, subject, text: body, attachments });
    await asService((db) => db.q("update identity.outbox set sent_at = now() where id = $1", [id]));
  } catch (e) { console.error("[mail] send failed; message stays in the outbox", e); }
}
export const link = (path: string) => `${env().APP_URL}${path}`;
