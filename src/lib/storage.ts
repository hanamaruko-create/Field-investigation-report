import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONTRACTOR_NAME, PROJECT_NAME } from "@/lib/constants";
import type { StoredFloorPlan } from "@/lib/floorPlanTypes";

export type DraftItemInput = {
  place: string;
  code?: string;
  disclaimerText?: string;
  photoIndexes: number[];
};

export type StoredPhoto = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type DraftItem = {
  id: string;
  place: string;
  code?: string;
  disclaimerText?: string;
  photos: StoredPhoto[];
};

export type Draft = {
  id: string;
  projectName: string;
  contractorName: string;
  surveyDate: string; // yyyy-mm-dd
  surveyContent: string[]; // 調査内容（複数）
  createdAt: string;
  items: DraftItem[];
  floorPlan?: StoredFloorPlan;
};

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DRAFTS_JSON = path.join(DATA_DIR, "drafts.json");

async function ensureDirs() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

// 旧データ (photo: single) を新形式 (photos: array) にマイグレーション
function migrateDraftItem(raw: Record<string, unknown>): DraftItem {
  if (Array.isArray(raw.photos)) {
    return raw as unknown as DraftItem;
  }
  // 旧形式: photo が単体で存在する場合
  const photos = raw.photo ? [raw.photo as StoredPhoto] : [];
  const { photo: _removed, ...rest } = raw;
  void _removed;
  return { ...(rest as Omit<DraftItem, "photos">), photos };
}

function migrateDraft(raw: Record<string, unknown>): Draft {
  const items = (raw.items as Array<Record<string, unknown>>).map(migrateDraftItem);
  return {
    ...(raw as Omit<Draft, "items" | "surveyContent">),
    surveyContent: Array.isArray(raw.surveyContent)
      ? (raw.surveyContent as string[])
      : typeof raw.surveyContent === "string" && raw.surveyContent
        ? [raw.surveyContent]
        : [],
    items,
  };
}

export async function listDrafts(): Promise<Draft[]> {
  await ensureDirs();
  const raws = await readJsonFile<Record<string, unknown>[]>(DRAFTS_JSON, []);
  const drafts = raws.map(migrateDraft);
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDraft(id: string): Promise<Draft | null> {
  const drafts = await listDrafts();
  return drafts.find((d) => d.id === id) ?? null;
}

function safeFileExt(originalName: string, mimeType: string) {
  const lower = originalName.toLowerCase();
  const idx = lower.lastIndexOf(".");
  const fromName = idx >= 0 ? lower.slice(idx + 1) : "";
  const allowed = new Set(["jpg", "jpeg", "png", "webp"]);
  if (allowed.has(fromName)) return fromName;
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

export async function storeUpload(file: File): Promise<StoredPhoto> {
  await ensureDirs();
  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  const ext = safeFileExt(file.name, file.type);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(fullPath, buf);

  return {
    filename,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: buf.length,
  };
}

export async function createDraft(params: {
  projectName: string;
  surveyDate: string;
  surveyContent: string[];
  items: Array<{
    id?: string;
    place: string;
    code?: string;
    disclaimerText?: string;
    photos: StoredPhoto[];
  }>;
  floorPlan?: StoredFloorPlan;
}): Promise<Draft> {
  await ensureDirs();
  const raws = await readJsonFile<Record<string, unknown>[]>(DRAFTS_JSON, []);
  const drafts = raws.map(migrateDraft);
  const now = new Date().toISOString();

  const draft: Draft = {
    id: crypto.randomUUID(),
    projectName: params.projectName || PROJECT_NAME,
    contractorName: CONTRACTOR_NAME,
    surveyDate: params.surveyDate,
    surveyContent: params.surveyContent,
    createdAt: now,
    items: params.items.map((it) => ({
      id: it.id ?? crypto.randomUUID(),
      place: it.place,
      code: it.code,
      disclaimerText: it.disclaimerText,
      photos: it.photos,
    })),
    floorPlan: params.floorPlan,
  };

  drafts.push(draft);
  await writeJsonFile(DRAFTS_JSON, drafts);
  return draft;
}

export async function addPhotosToItem(
  draftId: string,
  itemId: string,
  photos: StoredPhoto[],
): Promise<boolean> {
  await ensureDirs();
  const text = await fs.readFile(DRAFTS_JSON, "utf8").catch(() => "[]");
  const raws = JSON.parse(text) as Array<Record<string, unknown>>;
  const draftIdx = raws.findIndex((d) => String(d.id) === String(draftId));
  if (draftIdx === -1) return false;
  const items = raws[draftIdx].items as Array<Record<string, unknown>>;
  const itemIdx = items.findIndex((it) => String(it.id) === String(itemId));
  if (itemIdx === -1) return false;
  const existing = (items[itemIdx].photos as StoredPhoto[]) ?? [];
  items[itemIdx].photos = [...existing, ...photos];
  await fs.writeFile(DRAFTS_JSON, JSON.stringify(raws, null, 2), "utf8");
  return true;
}

export async function removePhotoFromItem(
  draftId: string,
  itemId: string,
  filename: string,
): Promise<boolean> {
  await ensureDirs();
  const text = await fs.readFile(DRAFTS_JSON, "utf8").catch(() => "[]");
  const raws = JSON.parse(text) as Array<Record<string, unknown>>;
  const draftIdx = raws.findIndex((d) => String(d.id) === String(draftId));
  if (draftIdx === -1) return false;
  const items = raws[draftIdx].items as Array<Record<string, unknown>>;
  const itemIdx = items.findIndex((it) => String(it.id) === String(itemId));
  if (itemIdx === -1) return false;
  const existing = (items[itemIdx].photos as StoredPhoto[]) ?? [];
  items[itemIdx].photos = existing.filter((p) => p.filename !== filename);
  await fs.writeFile(DRAFTS_JSON, JSON.stringify(raws, null, 2), "utf8");
  try { await fs.unlink(path.join(UPLOADS_DIR, filename)); } catch { /* 既になくても続行 */ }
  return true;
}

export async function updateDraftFloorPlan(
  id: string,
  floorPlan: StoredFloorPlan | undefined,
): Promise<boolean> {
  await ensureDirs();
  const text = await fs.readFile(DRAFTS_JSON, "utf8").catch(() => "[]");
  const raws = JSON.parse(text) as Array<Record<string, unknown>>;
  const idx = raws.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return false;
  if (floorPlan === undefined) {
    delete raws[idx].floorPlan;
  } else {
    raws[idx].floorPlan = floorPlan;
  }
  await fs.writeFile(DRAFTS_JSON, JSON.stringify(raws, null, 2), "utf8");
  return true;
}

export async function deleteDraft(id: string): Promise<boolean> {
  await ensureDirs();

  // マイグレーションを介さず生のJSONオブジェクトで操作（型変換ミスを避ける）
  const text = await fs.readFile(DRAFTS_JSON, "utf8").catch(() => "[]");
  const raws: Array<Record<string, unknown>> = JSON.parse(text) as Array<Record<string, unknown>>;

  const idx = raws.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return false;

  const target = raws[idx];

  // 紐づく画像ファイルを削除（新旧どちらの形式にも対応）
  const items = Array.isArray(target.items)
    ? (target.items as Array<Record<string, unknown>>)
    : [];
  for (const item of items) {
    const photos: Array<{ filename: string }> = Array.isArray(item.photos)
      ? (item.photos as Array<{ filename: string }>)
      : item.photo
        ? [item.photo as { filename: string }]
        : [];
    for (const photo of photos) {
      try {
        await fs.unlink(path.join(UPLOADS_DIR, photo.filename));
      } catch {
        // ファイルが既になくても続行
      }
    }
  }

  const remaining = raws.filter((_, i) => i !== idx);
  await fs.writeFile(DRAFTS_JSON, JSON.stringify(remaining, null, 2), "utf8");
  return true;
}

export function getUploadPath(filename: string) {
  return path.join(UPLOADS_DIR, filename);
}
