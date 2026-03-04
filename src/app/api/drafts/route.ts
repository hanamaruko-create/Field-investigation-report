import { NextResponse } from "next/server";
import { createDraft, listDrafts, storeUpload, type DraftItemInput } from "@/lib/storage";
import type { StoredFloorPlan } from "@/lib/floorPlanTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const drafts = await listDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const projectName = String(formData.get("projectName") ?? "").trim();
  const surveyDateRaw = String(formData.get("surveyDate") ?? "").trim();
  const surveyContentRaw = String(formData.get("surveyContent") ?? "[]");
  let surveyContent: string[] = [];
  try { surveyContent = JSON.parse(surveyContentRaw) as string[]; } catch { surveyContent = []; }
  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: DraftItemInput[];
  try {
    items = JSON.parse(itemsRaw) as DraftItemInput[];
  } catch {
    return NextResponse.json({ error: "items のJSONが不正です" }, { status: 400 });
  }

  if (!surveyDateRaw) {
    return NextResponse.json({ error: "surveyDate が必要です" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items は1件以上必要です" }, { status: 400 });
  }

  const photos = formData.getAll("photos").filter(Boolean) as File[];
  const storedItems = [];

  for (const item of items) {
    const place = (item.place ?? "").trim();
    if (!place) {
      return NextResponse.json({ error: "place が空の項目があります" }, { status: 400 });
    }

    const indexes = Array.isArray(item.photoIndexes) ? item.photoIndexes : [];
    if (indexes.length === 0) {
      return NextResponse.json(
        { error: `"${place}" に写真が指定されていません` },
        { status: 400 },
      );
    }

    const storedPhotos = [];
    for (const idx of indexes) {
      const photo = photos[idx];
      if (!photo) {
        return NextResponse.json(
          { error: `photoIndex=${idx} の写真が見つかりません` },
          { status: 400 },
        );
      }
      storedPhotos.push(await storeUpload(photo));
    }

    storedItems.push({
      place,
      code: item.code?.trim() ? String(item.code).trim() : undefined,
      disclaimerText: item.disclaimerText?.trim()
        ? String(item.disclaimerText).trim()
        : undefined,
      photos: storedPhotos,
    });
  }

  // 図面ファイルを処理（複数対応）
  const draftFloorPlans: StoredFloorPlan[] = [];
  for (let i = 0; ; i++) {
    const fpFile = formData.get(`floorPlan_${i}`);
    const fpDataRaw = formData.get(`floorPlanData_${i}`)?.toString();
    if (!(fpFile instanceof File) || !fpDataRaw) break;
    try {
      const fpData = JSON.parse(fpDataRaw) as {
        imageWidth: number; imageHeight: number;
        annotations: StoredFloorPlan["annotations"];
        eraserStrokes: StoredFloorPlan["eraserStrokes"];
      };
      const stored = await storeUpload(fpFile);
      draftFloorPlans.push({ filename: stored.filename, imageWidth: fpData.imageWidth, imageHeight: fpData.imageHeight, annotations: fpData.annotations, eraserStrokes: fpData.eraserStrokes });
    } catch { /* ignore */ }
  }

  const draft = await createDraft({
    projectName,
    surveyDate: surveyDateRaw,
    surveyContent,
    items: storedItems,
    floorPlans: draftFloorPlans,
  });

  return NextResponse.json({ draft }, { status: 201 });
}
