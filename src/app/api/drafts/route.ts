import { NextResponse } from "next/server";
import { createDraft, listDrafts, storeUpload, type DraftItemInput } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const drafts = await listDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const surveyDateRaw = String(formData.get("surveyDate") ?? "").trim();
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

  const draft = await createDraft({
    surveyDate: surveyDateRaw,
    items: storedItems,
  });

  return NextResponse.json({ draft }, { status: 201 });
}
