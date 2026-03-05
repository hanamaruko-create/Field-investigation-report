import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

// ─── インメモリ レート制限（1分間に同一IPから最大5回）────────────────────────
const RATE_LIMIT = 5;
const WINDOW_MS  = 60_000;

const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── アノテーション型 ────────────────────────────────────────────────────────
type RawAnnotation =
  | { type: "rect";    x: number; y: number; w: number; h: number; label?: string }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; label?: string }
  | { type: "line";    x1: number; y1: number; x2: number; y2: number }
  | { type: "arrow";   x1: number; y1: number; x2: number; y2: number }
  | { type: "text";    x: number; y: number; text: string };

function isNum(...vals: unknown[]): boolean {
  return vals.every((v) => typeof v === "number" && isFinite(v));
}

/** 必須フィールドが揃っていない要素を除外する */
function validateAnnotation(a: unknown): a is RawAnnotation {
  if (typeof a !== "object" || a === null) return false;
  const r = a as Record<string, unknown>;
  switch (r.type) {
    case "rect":    return isNum(r.x, r.y, r.w, r.h);
    case "ellipse": return isNum(r.cx, r.cy, r.rx, r.ry);
    case "line":
    case "arrow":   return isNum(r.x1, r.y1, r.x2, r.y2);
    case "text":    return isNum(r.x, r.y) && typeof r.text === "string";
    default:        return false;
  }
}

export async function POST(req: Request) {
  // ── レート制限チェック ──────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらくお待ちください" },
      { status: 429 },
    );
  }

  // ── APIキー確認 ─────────────────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "APIキーが設定されていません" },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const photo = formData.get("photo");
    const imageWidth  = Number(formData.get("imageWidth"));
    const imageHeight = Number(formData.get("imageHeight"));

    if (!(photo instanceof File) || !imageWidth || !imageHeight) {
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    }

    const buf    = Buffer.from(await photo.arrayBuffer());
    const base64 = buf.toString("base64");
    const mime   = (photo.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mime, data: base64 },
          },
          {
            type: "text",
            text: `この画像は手書きでマーキングされた図面の写真です。
図面の内側に手書きで追加された図形のみを検出してください。

【検出対象】
・図面の内側に手書きで描かれた四角形・円・矢印・直線
・図面に手書きで書かれた文字・数字（ペン・マーカーで直接書いたもの）

【絶対に検出しないもの】
・図面の外側（余白・白紙部分）に書かれたもの
・図面に最初から印刷・印字されているテキスト（店舗名・部屋名・面積・天井高・営業時間・寸法・記号・凡例など）
・図面に最初から印刷されている線・壁・柱・建具などの構造線

【labelフィールドについて】
・label は必ず空文字列 "" にしてください。説明文・図形の説明・位置の説明は絶対に入れないでください。

各図形の位置は画像全体の幅・高さに対するパーセンテージ（0〜100）で返してください。

以下のJSON形式のみで返してください（前後に説明文は不要）:
{
  "annotations": [
    {"type": "rect", "x": 数値, "y": 数値, "w": 数値, "h": 数値, "label": ""},
    {"type": "ellipse", "cx": 数値, "cy": 数値, "rx": 数値, "ry": 数値, "label": ""},
    {"type": "arrow", "x1": 数値, "y1": 数値, "x2": 数値, "y2": 数値},
    {"type": "line",  "x1": 数値, "y1": 数値, "x2": 数値, "y2": 数値},
    {"type": "text",  "x": 数値, "y": 数値, "text": "手書き文字のみ（印刷文字は絶対に含めない）"}
  ]
}`,
          },
        ],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

    let parsed: RawAnnotation[] = [];

    // まず全体JSONとしてパース
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]) as { annotations?: unknown };
        parsed = Array.isArray(obj.annotations) ? (obj.annotations as RawAnnotation[]) : [];
      } catch {
        // 全体パースが失敗した場合、アノテーションオブジェクトを1件ずつ抽出
        console.warn("[analyze-floor-plan] full JSON parse failed, trying per-object extraction");
        const objRegex = /\{\s*"type"\s*:\s*"(rect|ellipse|arrow|line|text)"[^{}]*\}/g;
        let m: RegExpExecArray | null;
        while ((m = objRegex.exec(stripped)) !== null) {
          try { parsed.push(JSON.parse(m[0]) as RawAnnotation); } catch { /* skip */ }
        }
      }
    }

    // 必須フィールドが揃っていない要素を除外
    const annotations = parsed.filter(validateAnnotation);

    if (annotations.length === 0) {
      return NextResponse.json({ error: "図形を検出できませんでした" }, { status: 500 });
    }

    const W = imageWidth, H = imageHeight;
    const p = (v: number, dim: number) => (v / 100) * dim;

    const converted = annotations.map((a) => {
      switch (a.type) {
        case "rect":
          return { type: "rect",    x: p(a.x, W),   y: p(a.y, H),   w: p(a.w, W),   h: p(a.h, H),   label: a.label ?? "" };
        case "ellipse":
          return { type: "ellipse", cx: p(a.cx, W),  cy: p(a.cy, H), rx: p(a.rx, W), ry: p(a.ry, H), label: a.label ?? "" };
        case "arrow":
          return { type: "arrow",   x1: p(a.x1, W), y1: p(a.y1, H), x2: p(a.x2, W), y2: p(a.y2, H) };
        case "line":
          return { type: "line",    x1: p(a.x1, W), y1: p(a.y1, H), x2: p(a.x2, W), y2: p(a.y2, H) };
        case "text":
          return { type: "text",    x: p(a.x, W),   y: p(a.y, H),   text: a.text };
      }
    });

    return NextResponse.json({ annotations: converted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-floor-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
