import { redirect } from "next/navigation";
import { listDrafts } from "@/lib/storage";

export const runtime = "nodejs";

export default async function ReportIndexPage() {
  const drafts = await listDrafts();
  if (drafts.length > 0) {
    redirect(`/report/${drafts[0].id}`);
  }
  redirect("/drafts");
}
