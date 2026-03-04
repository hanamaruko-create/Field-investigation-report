import { NextResponse } from "next/server";
import { deleteDraft, getDraft, storeUpload, updateDraftFloorPlan } from "@/lib/storage";
import type { Annotation, EraserStroke } from "@/lib/floorPlanTypes";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const draft = await getDraft(id);
  if (!draft) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const formData = await req.formData();
    const action = formData.get("action")?.toString();

    if (action === "delete-floor-plan") {
      const ok = await updateDraftFloorPlan(id, undefined);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    const fpFile = formData.get("floorPlan");
    const fpDataRaw = formData.get("floorPlanData")?.toString();
    if (!(fpFile instanceof File) || !fpDataRaw) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const fpData = JSON.parse(fpDataRaw) as {
      imageWidth: number; imageHeight: number;
      annotations: Annotation[]; eraserStrokes: EraserStroke[];
    };
    const stored = await storeUpload(fpFile);
    const ok = await updateDraftFloorPlan(id, {
      filename: stored.filename,
      imageWidth: fpData.imageWidth,
      imageHeight: fpData.imageHeight,
      annotations: fpData.annotations,
      eraserStrokes: fpData.eraserStrokes,
    });
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, filename: stored.filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/drafts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const ok = await deleteDraft(id);
    if (!ok) {
      return NextResponse.json({ error: `id=${id} が見つかりません` }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/drafts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
