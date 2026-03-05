import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getUploadPath } from "@/lib/storage";

export const runtime = "nodejs";

function contentTypeFromExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "不正なファイル名です" }, { status: 400 });
  }

  const fullPath = getUploadPath(filename);
  try {
    const data = await fs.readFile(fullPath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "content-type": contentTypeFromExt(filename),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
}

