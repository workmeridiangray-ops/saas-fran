import { Shell } from "@/components/shell/Shell";
import { requireCtx } from "@/lib/ctx";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  return <Shell ctx={ctx}>{children}</Shell>;
}
