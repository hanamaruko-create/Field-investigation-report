import { NextResponse } from "next/server";
import { addFloorPlanToDraft, addItemToDraft, addPhotosToItem, deleteUploads, deleteDraft, getDraft, removeFloorPlanFromDraft, removePhotoFromItem, storeUpload, updateDraftFull } from "@/lib/storage";
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

    if (action === "add-floor-plan") {
      const fpFile = formData.get("floorPlan");
      const fpDataRaw = formData.get("floorPlanData")?.toString();
      if (!(fpFile instanceof File) || !fpDataRaw) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const fpData = JSON.parse(fpDataRaw) as { imageWidth: number; imageHeight: number; annotations: Annotation[]; eraserStrokes: EraserStroke[] };
      const stored = await storeUpload(fpFile);
      const floorPlan = { filename: stored.filename, imageWidth: fpData.imageWidth, imageHeight: fpData.imageHeight, annotations: fpData.annotations, eraserStrokes: fpData.eraserStrokes };
      const ok = await addFloorPlanToDraft(id, floorPlan);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true, floorPlan });
    }

    if (action === "delete-floor-plan") {
      const filename = formData.get("filename")?.toString();
      if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });
      const ok = await removeFloorPlanFromDraft(id, filename);
      if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/drafts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getDraft(id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const formData = await req.formData();
    const projectName = formData.get("projectName")?.toString() ?? "";
    const surveyDate  = formData.get("surveyDate")?.toString() ?? "";
    const surveyContent = JSON.parse(formData.get("surveyContent")?.toString() ?? "[]") as string[];
    const itemsMeta = JSON.parse(formData.get("items")?.toString() ?? "[]") as Array<{
      id: string | null; place: string; code: string; disclaimerText: string; keepFilenames: string[];
    }>;

    const newItems = [];
    for (let i = 0; i < itemsMeta.length; i++) {
      const meta = itemsMeta[i];
      const existingItem = meta.id ? existing.items.find((it) => it.id === meta.id) : null;
      const keptPhotos = (existingItem?.photos ?? []).filter((p) => meta.keepFilenames.includes(p.filename));
      const removedFilenames = (existingItem?.photos ?? []).filter((p) => !meta.keepFilenames.includes(p.filename)).map((p) => p.filename);
      if (removedFilenames.length) await deleteUploads(removedFilenames);
      const newPhotoFiles = formData.getAll(`photos_${i}`);
      const newStoredPhotos = [];
      for (const file of newPhotoFiles) {
        if (file instanceof File && file.size > 0) newStoredPhotos.push(await storeUpload(file));
      }
      newItems.push({ id: meta.id ?? crypto.randomUUID(), place: meta.place, code: meta.code, disclaimerText: meta.disclaimerText, photos: [...keptPhotos, ...newStoredPhotos] });
    }

    const ok = await updateDraftFull(id, { projectName, surveyDate, surveyContent, items: newItems });
    if (!ok) return NextResponse.json({ error: "update failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/drafts/[id]]", message);
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
