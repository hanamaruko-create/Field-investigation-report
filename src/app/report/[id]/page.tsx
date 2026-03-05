import { notFound } from "next/navigation";
import { getDraft } from "@/lib/storage";
import ReportEditor from "./ReportEditor";

export const runtime = "nodejs";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await getDraft(id);

  if (!draft) {
    notFound();
  }

  return <ReportEditor draft={draft} />;
}
