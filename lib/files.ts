/** Allowed upload types. The stored type is ours (from the extension), never the client's claim. */
export const ALLOWED: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  txt: "text/plain", csv: "text/csv", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const MAX_BYTES = 5 * 1024 * 1024;
const MAGIC: Record<string, number[]> = { pdf: [0x25, 0x50, 0x44, 0x46], png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], jpeg: [0xff, 0xd8, 0xff], gif: [0x47, 0x49, 0x46], webp: [0x52, 0x49, 0x46, 0x46], docx: [0x50, 0x4b], xlsx: [0x50, 0x4b] };

export function checkUpload(name: string, bytes: Uint8Array): { ok: true; type: string; safeName: string } | { ok: false; error: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[ext]) return { ok: false, error: `.${ext || "?"} files aren't allowed. Use PDF, images, text, CSV, Word or Excel.` };
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "Files can be up to 5 MB." };
  const magic = MAGIC[ext];
  if (magic && !magic.every((b, i) => bytes[i] === b)) return { ok: false, error: `That doesn't look like a real .${ext} file.` };
  return { ok: true, type: ALLOWED[ext]!, safeName: name.replace(/[^\w.\- ]+/g, "_").slice(-120) };
}
