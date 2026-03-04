import { NextResponse } from "next/server";
import { addItemToDraft, addPhotosToItem, deleteDraft, getDraft, removePhotoFromItem, storeUpload, updateDraftFloorPlan } from "@/lib/storage";
import crypto from "node:crypto";
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

    if (action === "add-item") {
      const place = formData.get("place")?.toString().trim() ?? "";
      const disclaimerText = formData.get("disclaimerText")?.toString() ?? "";
      if (!place) return NextResponse.json({ error: "place required" }, { status: 400 });
      const files = formData.getAll("photos");
      const photos = [];
      for (const file of files) {
        if (file instanceof File && file.size > 0) photos.push(await storeUpload(file));
      }
      const newItem = { id: crypto.randomUUID(), place, disclaimerText, photos };
      const ok = await addItemToDraft(id, newItem);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true, item: newItem });
    }

    if (action === "add-photos") {
      const itemId = formData.get("itemId")?.toString();
      if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
      const files = formData.getAll("photos");
      const stored = [];
      for (const file of files) {
        if (file instanceof File && file.size > 0) stored.push(await storeUpload(file));
      }
      const ok = await addPhotosToItem(id, itemId, stored);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true, photos: stored });
    }

    if (action === "remove-photo") {
      const itemId = formData.get("itemId")?.toString();
      const filename = formData.get("filename")?.toString();
      if (!itemId || !filename) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const ok = await removePhotoFromItem(id, itemId, filename);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

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
