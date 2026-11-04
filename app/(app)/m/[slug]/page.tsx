import { Construction } from "lucide-react";
import { ButtonLink, PageHeader, StateMessage } from "@/components/ui";
import { findBySlug } from "@/lib/nav";

const RELEASE = { R1: "first commercial release", R2: "second release", extension: "a separately priced extension" } as const;

export default async function ModulePlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = findBySlug(slug);
  const title = item?.label ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <>
      <PageHeader title={title} />
      <StateMessage icon={Construction} title="This screen is planned, not built yet"
        actions={<ButtonLink href="/">Back to command centre</ButtonLink>}>
        {item ? `It is scheduled for the ${RELEASE[item.release]}. ` : ""}See docs/screen-register.md for its roles, workflow, permissions and acceptance criteria. No data was lost or changed.
      </StateMessage>
    </>
  );
}
