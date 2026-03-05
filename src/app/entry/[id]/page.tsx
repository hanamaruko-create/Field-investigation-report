import { notFound } from "next/navigation";
import { getDraft } from "@/lib/storage";
import EditForm from "./EditForm";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await getDraft(id);
  if (!draft) notFound();
  return <EditForm draft={draft} />;
}
