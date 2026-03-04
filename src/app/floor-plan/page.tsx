"use client";

import { useEffect, useRef, useState } from "react";

// ── 型定義 ──────────────────────────────────────────────────────────────────

type RectA    = { id: string; seq: number; type: "rect";    x: number;  y: number;  w: number;  h: number;  label: string; color: string };
type EllipseA = { id: string; seq: number; type: "ellipse"; cx: number; cy: number; rx: number; ry: number; label: string; color: string };
type LineA    = { id: string; seq: number; type: "line";    x1: number; y1: number; x2: number; y2: number; color: string };
type ArrowA   = { id: string; seq: number; type: "arrow";   x1: number; y1: number; x2: number; y2: number; color: string };
type TextA    = { id: string; seq: number; type: "text";    x: number;  y: number;  text: string; fontSize?: number; color: string };
type Annotation = RectA | EllipseA | LineA | ArrowA | TextA;

type EraserStroke = { id: string; seq: number; points: { x: number; y: number }[]; width: number };

type DrawTool = "rect" | "ellipse" | "line" | "arrow" | "text";
type Tool     = DrawTool | "select" | "eraser";

type DragState =
  | { mode: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { mode: "move"; id: string; sx: number; sy: number; orig: Annotation };

// ── 定数 ────────────────────────────────────────────────────────────────────

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#000000"];
const STORAGE_KEY = "floor-plan-v2";

const TOOLS: { key: Tool; label: string }[] = [
  { key: "select",  label: "選択・移動" },
  { key: "rect",    label: "四角" },
  { key: "ellipse", label: "円・楕円" },
  { key: "line",    label: "直線" },
  { key: "arrow",   label: "矢印" },
  { key: "text",    label: "テキスト" },
  { key: "eraser",  label: "消しゴム" },
];

const HINTS: Record<Tool, string> = {
  select:  "クリックして選択 → ドラッグで移動",
  rect:    "ドラッグして四角形を描く",
  ellipse: "ドラッグして円・楕円を描く",
  line:    "ドラッグして直線を描く",
  arrow:   "ドラッグして矢印を描く（終点に矢頭）",
  text:    "クリックした位置にテキストを追加",
  eraser:  "ドラッグして描いた線の上をなぞると消えます",
};

// ── ユーティリティ ────────────────────────────────────────────────────────

function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "rect":    return { ...a, x: a.x + dx, y: a.y + dy };
    case "ellipse": return { ...a, cx: a.cx + dx, cy: a.cy + dy };
    case "line":
    case "arrow":   return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    case "text":    return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function Arrowhead({ x1, y1, x2, y2, color, size }: {
  x1: number; y1: number; x2: number; y2: number; color: string; size: number;
}) {
  const a = Math.atan2(y2 - y1, x2 - x1), sp = Math.PI / 6;
  return (
    <polygon
      points={`${x2},${y2} ${x2 - size * Math.cos(a - sp)},${y2 - size * Math.sin(a - sp)} ${x2 - size * Math.cos(a + sp)},${y2 - size * Math.sin(a + sp)}`}
      fill={color}
    />
  );
}

// ── メインコンポーネント ─────────────────────────────────────────────────

export default function FloorPlanPage() {
  const [imageDataUrl,         setImageDataUrl]         = useState<string | null>(null);
  const [imageSize,            setImageSize]            = useState({ w: 1, h: 1 });
  const [annotations,          setAnnotations]          = useState<Annotation[]>([]);
  const [eraserStrokes,        setEraserStrokes]        = useState<EraserStroke[]>([]);
  const [currentEraserPoints,  setCurrentEraserPoints]  = useState<{ x: number; y: number }[]>([]);
  const [isErasing,            setIsErasing]            = useState(false);
  const [eraserSize,           setEraserSize]           = useState<"s" | "m" | "l">("m");
  const [tool,                 setTool]                 = useState<Tool>("rect");
  const [color,                setColor]                = useState("#ef4444");
  const [selectedId,           setSelectedId]           = useState<string | null>(null);
  const [drag,                 setDrag]                 = useState<DragState | null>(null);
  const [pendingText,          setPendingText]          = useState<{ x: number; y: number } | null>(null);
  const [textInput,            setTextInput]            = useState("");
  const [savedAt,              setSavedAt]              = useState<string | null>(null);
  const [svgCursor,            setSvgCursor]            = useState<{ x: number; y: number } | null>(null);
  const [zoom,                 setZoom]                 = useState(100);
  const [isDragOver,           setIsDragOver]           = useState(false);

  const svgRef  = useRef<SVGSVGElement>(null);
  const seqRef  = useRef(0);
  function nextSeq() { return ++seqRef.current; }

  // ── LocalStorage ロード ──────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        imageDataUrl?: string;
        imageSize?: typeof imageSize;
        annotations?: Annotation[];
        eraserStrokes?: EraserStroke[];
      };
      if (d.imageDataUrl) setImageDataUrl(d.imageDataUrl);
      if (d.imageSize)    setImageSize(d.imageSize);
      // seq がない旧データは index で補完（アノテーション → 消しゴムの順で番号付け）
      const anns = (d.annotations ?? []).map((a, i) => ({ seq: i, ...a } as Annotation));
      const esLen = anns.length;
      const erss = (d.eraserStrokes ?? []).map((s, i) => ({ seq: esLen + i, ...s } as EraserStroke));
      if (anns.length)  setAnnotations(anns);
      if (erss.length)  setEraserStrokes(erss);
      seqRef.current = esLen + erss.length;
    } catch { /* ignore */ }
  }, []);

  // グローバル mouseup（SVG外でリリースされた場合の安全弁）
  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // ── 座標変換 ─────────────────────────────────────────────────────────

  function toSvg(e: React.MouseEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width)  * imageSize.w,
      y: ((e.clientY - r.top)  / r.height) * imageSize.h,
    };
  }

  // ── ドラッグ&ドロップ ─────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  // ── ファイル読み込み ──────────────────────────────────────────────────

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        setImageDataUrl(dataUrl);
        setAnnotations([]);
        setEraserStrokes([]);
        setSelectedId(null);
        setSavedAt(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ── 一時保存 ──────────────────────────────────────────────────────────

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ imageDataUrl, imageSize, annotations, eraserStrokes }));
    setSavedAt(new Date().toLocaleTimeString("ja-JP"));
  }

  // ── SVGマウスイベント ────────────────────────────────────────────────

  function onSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const p = toSvg(e);

    if (tool === "eraser") {
      e.preventDefault();
      setIsErasing(true);
      setCurrentEraserPoints([p]);
      return;
    }
    if (tool === "select") { setSelectedId(null); return; }
    if (tool === "text")   return;
    e.preventDefault();
    setDrag({ mode: "draw", sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  }

  function onSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const p = toSvg(e);

    if (tool === "eraser") {
      setSvgCursor(p);
      if (isErasing) setCurrentEraserPoints(prev => [...prev, p]);
      return;
    }
    setSvgCursor(null);

    if (!drag) return;
    if (drag.mode === "draw") {
      setDrag({ ...drag, cx: p.x, cy: p.y });
    } else {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      setAnnotations(prev => prev.map(a => a.id === drag.id ? translate(drag.orig, dx, dy) : a));
    }
  }

  function onSvgMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    // 消しゴム確定
    if (tool === "eraser") {
      if (isErasing && currentEraserPoints.length > 0) {
        const w = eraserWidths[eraserSize];
        setEraserStrokes(prev => [...prev, { id: crypto.randomUUID(), seq: nextSeq(), points: currentEraserPoints, width: w }]);
      }
      setCurrentEraserPoints([]);
      setIsErasing(false);
      return;
    }

    // テキストツール
    if (tool === "text" && !drag) {
      const p = toSvg(e);
      setPendingText(p);
      setTextInput("");
      return;
    }

    if (!drag || drag.mode !== "draw") { setDrag(null); return; }

    const { sx, sy, cx, cy } = drag;
    const minX = Math.min(sx, cx), minY = Math.min(sy, cy);
    const w = Math.abs(cx - sx), h = Math.abs(cy - sy);

    if (w > 5 || h > 5) {
      const id = crypto.randomUUID();
      const seq = nextSeq();
      let newA: Annotation | null = null;
      switch (tool) {
        case "rect":    newA = { id, seq, type: "rect",    x: minX, y: minY, w, h, label: "", color }; break;
        case "ellipse": newA = { id, seq, type: "ellipse", cx: (sx+cx)/2, cy: (sy+cy)/2, rx: w/2, ry: h/2, label: "", color }; break;
        case "line":    newA = { id, seq, type: "line",    x1: sx, y1: sy, x2: cx, y2: cy, color }; break;
        case "arrow":   newA = { id, seq, type: "arrow",   x1: sx, y1: sy, x2: cx, y2: cy, color }; break;
      }
      if (newA) setAnnotations(prev => [...prev, newA!]);
    }
    setDrag(null);
  }

  function onAnnotationMouseDown(id: string, e: React.MouseEvent) {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(id);
    const p = toSvg(e);
    const orig = annotations.find(a => a.id === id)!;
    setDrag({ mode: "move", id, sx: p.x, sy: p.y, orig });
  }

  // ── テキスト確定 ──────────────────────────────────────────────────────

  function commitText() {
    if (!pendingText || !textInput.trim()) { setPendingText(null); return; }
    setAnnotations(prev => [...prev, {
      id: crypto.randomUUID(), seq: nextSeq(), type: "text",
      x: pendingText.x, y: pendingText.y,
      text: textInput.trim(), color,
    }]);
    setPendingText(null);
    setTextInput("");
  }

  function deleteSelected() {
    if (!selectedId) return;
    setAnnotations(prev => prev.filter(a => a.id !== selectedId));
    setSelectedId(null);
  }

  function updateLabel(id: string, label: string) {
    setAnnotations(prev =>
      prev.map(a => (a.id === id && (a.type === "rect" || a.type === "ellipse")) ? { ...a, label } : a),
    );
  }

  function updateText(id: string, text: string) {
    setAnnotations(prev => prev.map(a => (a.id === id && a.type === "text") ? { ...a, text } : a));
  }

  function updateTextSize(id: string, fontSize: number) {
    setAnnotations(prev => prev.map(a => (a.id === id && a.type === "text") ? { ...a, fontSize } : a));
  }

  // ── サイズ系 ─────────────────────────────────────────────────────────

  const fs = Math.max(imageSize.w, imageSize.h) * 0.022;
  const sw = fs * 0.15;
  const eraserWidths = { s: fs * 0.9, m: fs * 2, l: fs * 4 };

  // ── プレビュー描画 ────────────────────────────────────────────────────

  function renderDraft() {
    if (!drag || drag.mode !== "draw") return null;
    const { sx, sy, cx, cy } = drag;
    const minX = Math.min(sx, cx), minY = Math.min(sy, cy);
    const w = Math.abs(cx - sx), h = Math.abs(cy - sy);
    const base = { fill: "none" as const, stroke: color, strokeWidth: sw * 1.5, strokeDasharray: `${fs} ${fs*0.4}`, opacity: 0.75 };
    switch (tool) {
      case "rect":    return <rect x={minX} y={minY} width={w} height={h} {...base} />;
      case "ellipse": return <ellipse cx={(sx+cx)/2} cy={(sy+cy)/2} rx={w/2} ry={h/2} {...base} />;
      case "line":    return <line x1={sx} y1={sy} x2={cx} y2={cy} stroke={color} strokeWidth={sw*1.5} opacity={0.75} strokeLinecap="round" />;
      case "arrow":   return (
        <g opacity={0.75}>
          <line x1={sx} y1={sy} x2={cx} y2={cy} stroke={color} strokeWidth={sw*1.5} strokeLinecap="round" />
          <Arrowhead x1={sx} y1={sy} x2={cx} y2={cy} color={color} size={fs*0.8} />
        </g>
      );
      default: return null;
    }
  }

  // ── アノテーション描画 ────────────────────────────────────────────────

  function renderAnnotation(a: Annotation) {
    const isSel = selectedId === a.id;
    const sw2 = isSel ? sw * 3 : sw * 1.5;
    const dash = isSel ? `${fs} ${fs*0.4}` : undefined;
    const cur  = tool === "select" ? ("move" as const) : ("default" as const);
    const onMD = (e: React.MouseEvent) => onAnnotationMouseDown(a.id, e);
    const txt  = { fill: a.color, fontSize: fs, fontWeight: "700" as const, paintOrder: "stroke" as const, stroke: "white", strokeWidth: fs*0.25 };

    switch (a.type) {
      case "rect":
        return (
          <g key={a.id} style={{ cursor: cur }} onMouseDown={onMD}>
            <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={isSel ? `${a.color}22` : "none"} stroke={a.color} strokeWidth={sw2} strokeDasharray={dash} />
            {a.label && <text x={a.x+sw} y={a.y-sw} {...txt}>{a.label}</text>}
          </g>
        );
      case "ellipse":
        return (
          <g key={a.id} style={{ cursor: cur }} onMouseDown={onMD}>
            <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} fill={isSel ? `${a.color}22` : "none"} stroke={a.color} strokeWidth={sw2} strokeDasharray={dash} />
            {a.label && <text x={a.cx-a.rx+sw} y={a.cy-a.ry-sw} {...txt}>{a.label}</text>}
          </g>
        );
      case "line":
        return (
          <g key={a.id} style={{ cursor: cur }} onMouseDown={onMD}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={sw2*5} />
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={sw2} strokeLinecap="round" strokeDasharray={dash} />
          </g>
        );
      case "arrow":
        return (
          <g key={a.id} style={{ cursor: cur }} onMouseDown={onMD}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={sw2*5} />
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={sw2} strokeLinecap="round" strokeDasharray={dash} />
            <Arrowhead x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} color={a.color} size={fs*0.8} />
          </g>
        );
      case "text": {
        const tfs = a.fontSize ?? fs;
        return (
          <text key={a.id} x={a.x} y={a.y}
            fill={a.color} fontSize={tfs} fontWeight="700" paintOrder="stroke" stroke="white" strokeWidth={tfs * 0.25}
            style={{ cursor: cur, userSelect: "none" }} textDecoration={isSel ? "underline" : undefined} onMouseDown={onMD}>
            {a.text}
          </text>
        );
      }
    }
  }

  const selectedA = annotations.find(a => a.id === selectedId);

  return (
    <div
      className={`min-h-screen bg-zinc-100 transition-colors ${isDragOver ? "bg-blue-50" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={handleDrop}
    >

      {/* ── ツールバー ── */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 shadow-sm">
        <a href="/" className="shrink-0 text-sm text-zinc-600 hover:text-zinc-900">← トップへ</a>
        <span className="text-zinc-300">|</span>

        <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">
          図面を読み込む
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>

        {imageDataUrl && (
          <>
            <span className="text-zinc-300">|</span>

            {TOOLS.map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => { setTool(key); setPendingText(null); setDrag(null); }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  tool === key
                    ? key === "eraser" ? "bg-zinc-500 text-white" : "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}>
                {label}
              </button>
            ))}

            {/* 消しゴムサイズ */}
            {tool === "eraser" && (
              <>
                <span className="text-zinc-300">|</span>
                <span className="text-xs text-zinc-500">サイズ：</span>
                {(["s", "m", "l"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setEraserSize(s)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      eraserSize === s ? "bg-zinc-500 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}>
                    {s === "s" ? "小" : s === "m" ? "中" : "大"}
                  </button>
                ))}
                {eraserStrokes.length > 0 && (
                  <button type="button" onClick={() => setEraserStrokes([])}
                    className="rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50">
                    消しゴムをリセット
                  </button>
                )}
              </>
            )}

            {/* カラーパレット（消しゴム以外） */}
            {tool !== "eraser" && (
              <>
                <span className="text-zinc-300">|</span>
                <div className="flex gap-1.5">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className="h-6 w-6 rounded-full transition"
                      style={{ backgroundColor: c, outline: color === c ? `2.5px solid ${c}` : undefined, outlineOffset: "2px" }} />
                  ))}
                </div>
              </>
            )}

            {/* 選択中アノテーション操作 */}
            {selectedA && tool === "select" && (
              <>
                <span className="text-zinc-300">|</span>
                {(selectedA.type === "rect" || selectedA.type === "ellipse") && (
                  <input type="text" value={selectedA.label}
                    onChange={(e) => updateLabel(selectedId!, e.target.value)}
                    placeholder="ラベル"
                    className="h-8 w-28 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400" />
                )}
                {selectedA.type === "text" && (
                  <>
                    <input type="text" value={selectedA.text}
                      onChange={(e) => updateText(selectedId!, e.target.value)}
                      placeholder="テキスト"
                      className="h-8 w-36 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400" />
                    <span className="text-xs text-zinc-500">サイズ：</span>
                    {(["S", "M", "L", "XL"] as const).map((sz) => {
                      const size = sz === "S" ? fs * 0.7 : sz === "M" ? fs : sz === "L" ? fs * 1.5 : fs * 2.5;
                      const active = Math.round((selectedA.fontSize ?? fs) * 10) === Math.round(size * 10);
                      return (
                        <button key={sz} type="button" onClick={() => updateTextSize(selectedId!, size)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                            active ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}>
                          {sz}
                        </button>
                      );
                    })}
                  </>
                )}
                <button type="button" onClick={deleteSelected}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                  削除
                </button>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* ズームコントロール */}
              <button type="button" onClick={() => setZoom(z => Math.max(30, z - 10))}
                className="h-7 w-7 rounded border border-zinc-200 bg-white text-sm font-medium hover:bg-zinc-50">－</button>
              <span className="min-w-[3rem] text-center text-xs text-zinc-600">{zoom}%</span>
              <button type="button" onClick={() => setZoom(z => Math.min(200, z + 10))}
                className="h-7 w-7 rounded border border-zinc-200 bg-white text-sm font-medium hover:bg-zinc-50">＋</button>
              <span className="text-zinc-300">|</span>
              {savedAt && <span className="text-xs text-zinc-400">{savedAt} 保存済</span>}
              <button type="button" onClick={save}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                一時保存
              </button>
              <button type="button" onClick={() => window.print()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
                PDF出力
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── キャンバス ── */}
      <div className="p-6">
        {!imageDataUrl ? (
          <label className={`flex h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white text-sm text-zinc-500 transition-colors ${isDragOver ? "border-blue-400 bg-blue-50 text-blue-600" : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50"}`}>
            <span className="text-3xl">🗺️</span>
            <span>{isDragOver ? "ここにドロップ" : "ここをクリック、またはドラッグ&ドロップで図面を読み込む"}</span>
            <span className="text-xs text-zinc-400">一時保存済みのデータは自動で復元されます</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        ) : (
          <div className="overflow-x-auto">
          <div style={{ width: `${zoom}%`, minWidth: "300px", margin: "0 auto" }}>
            <div className="relative inline-block w-full select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="図面"
                style={{ display: "block", width: "100%", userSelect: "none", pointerEvents: "none" }} />

              <svg ref={svgRef}
                viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  cursor: tool === "select" ? "default" : tool === "text" ? "text" : tool === "eraser" ? "none" : "crosshair",
                }}
                onMouseDown={onSvgMouseDown}
                onMouseMove={onSvgMouseMove}
                onMouseUp={onSvgMouseUp}
                onMouseLeave={() => setSvgCursor(null)}
              >
                <defs>
                  {/* 図形ごとの消しゴムマスク：その図形より前に引いたストロークだけ適用 */}
                  {annotations.map(a => (
                    <mask key={`mask-${a.id}`} id={`em-${a.id}`}>
                      <rect x="0" y="0" width={imageSize.w} height={imageSize.h} fill="white" />
                      {eraserStrokes
                        .filter(s => s.seq > a.seq)
                        .map(s => (
                          <path key={s.id} d={pointsToPath(s.points)}
                            stroke="black" strokeWidth={s.width}
                            strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        ))}
                      {/* ドラッグ中のプレビュー（既存図形のみに適用） */}
                      {isErasing && currentEraserPoints.length > 1 && (
                        <path d={pointsToPath(currentEraserPoints)}
                          stroke="black" strokeWidth={eraserWidths[eraserSize]}
                          strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      )}
                    </mask>
                  ))}
                </defs>

                {/* 各アノテーションに個別マスクを適用 */}
                {annotations.map(a => (
                  <g key={`w-${a.id}`} mask={`url(#em-${a.id})`}>
                    {renderAnnotation(a)}
                  </g>
                ))}
                {renderDraft()}

                {/* 消しゴムカーソルの円（SVG上に描画） */}
                {tool === "eraser" && svgCursor && (
                  <circle
                    cx={svgCursor.x} cy={svgCursor.y}
                    r={eraserWidths[eraserSize] / 2}
                    fill={isErasing ? "rgba(100,100,100,0.15)" : "rgba(100,100,100,0.08)"}
                    stroke="#888"
                    strokeWidth={sw * 0.5}
                    strokeDasharray={`${fs * 0.3} ${fs * 0.3}`}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </svg>

              {/* テキスト入力ポップアップ */}
              {pendingText && (
                <div className="absolute z-30 flex gap-1 rounded-lg border border-zinc-300 bg-white p-1 shadow-lg"
                  style={{
                    left: `${(pendingText.x / imageSize.w) * 100}%`,
                    top:  `${(pendingText.y / imageSize.h) * 100}%`,
                    transform: "translate(-50%, -110%)",
                  }}>
                  <input autoFocus type="text" value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  commitText();
                      if (e.key === "Escape") { setPendingText(null); setTextInput(""); }
                    }}
                    placeholder="テキストを入力"
                    className="h-8 w-40 rounded px-2 text-sm outline-none" />
                  <button type="button" onClick={commitText}
                    className="rounded bg-zinc-900 px-2 text-xs text-white">追加</button>
                </div>
              )}
            </div>

            <p className="no-print mt-2 text-center text-xs text-zinc-400">{HINTS[tool]}</p>
          </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
