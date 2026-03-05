import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type RawAnnotation =
  | { type: "rect";    x: number; y: number; w: number; h: number; label?: string }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; label?: string }
  | { type: "line";    x1: number; y1: number; x2: number; y2: number }
  | { type: "arrow";   x1: number; y1: number; x2: number; y2: number }
  | { type: "text";    x: number; y: number; text: string };

export async function POST(req: Request) {
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
      max_tokens: 1024,
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
手書きで書かれた図形（四角形・円・矢印・直線・テキスト）を検出してください。
各図形の位置は画像全体の幅・高さに対するパーセンテージ（0〜100）で返してください。

以下のJSON形式のみで返してください（前後に説明文は不要）:
{
  "annotations": [
    {"type": "rect", "x": 数値, "y": 数値, "w": 数値, "h": 数値, "label": ""},
    {"type": "ellipse", "cx": 数値, "cy": 数値, "rx": 数値, "ry": 数値, "label": ""},
    {"type": "arrow", "x1": 数値, "y1": 数値, "x2": 数値, "y2": 数値},
    {"type": "line",  "x1": 数値, "y1": 数値, "x2": 数値, "y2": 数値},
    {"type": "text",  "x": 数値, "y": 数値, "text": "検出した文字"}
  ]
}`,
          },
        ],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI応答のパースに失敗しました" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { annotations: RawAnnotation[] };
    const W = imageWidth, H = imageHeight;
    const p = (v: number, dim: number) => (v / 100) * dim;

    const annotations = parsed.annotations.map((a) => {
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

    return NextResponse.json({ annotations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-floor-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
