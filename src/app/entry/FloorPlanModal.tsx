"use client";

import { useEffect, useRef, useState } from "react";
import type { Annotation, EraserStroke, SymbolKind } from "@/lib/floorPlanTypes";
import { randomUUID } from "@/lib/uuid";

// ─── ローカル型 ───────────────────────────────────────────────────────────────

type DrawTool = "rect" | "ellipse" | "line" | "arrow" | "text";
type Tool     = DrawTool | "select" | "eraser" | "symbol";

type DragState =
  | { mode: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { mode: "move"; id: string; sx: number; sy: number; orig: Annotation };

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#000000"];

const TOOLS: { key: Tool; label: string }[] = [
  { key: "select",  label: "選択・移動" },
  { key: "rect",    label: "四角" },
  { key: "ellipse", label: "円・楕円" },
  { key: "line",    label: "直線" },
  { key: "arrow",   label: "矢印" },
  { key: "text",    label: "テキスト" },
  { key: "symbol",  label: "シンボル" },
  { key: "eraser",  label: "消しゴム" },
];

const SYMBOL_KINDS: { kind: SymbolKind; label: string }[] = [
  { kind: "ac",      label: "AC" },
  { kind: "intake",  label: "吸気口" },
  { kind: "exhaust", label: "排気口" },
  { kind: "fan",     label: "搬送ファン" },
  { kind: "louver",  label: "ガラリ" },
];

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "rect":    return { ...a, x: a.x + dx, y: a.y + dy };
    case "ellipse": return { ...a, cx: a.cx + dx, cy: a.cy + dy };
    case "line":
    case "arrow":   return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    case "text":
    case "symbol":  return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

function SymbolShape({ x, y, symbolKind, label, color, size, isSel, sw, fs }: {
  x: number; y: number; symbolKind: SymbolKind; label: string; color: string; size: number; isSel: boolean; sw: number; fs: number;
}) {
  const sw2 = isSel ? sw * 3 : sw * 1.5;
  const fill = isSel ? `${color}22` : "none";
  const labelProps = { fill: color, fontSize: fs * 0.6, fontWeight: "700" as const, textAnchor: "middle" as const, paintOrder: "stroke" as const, stroke: "white", strokeWidth: fs * 0.15 };
  const iconProps = { fill: color, fontSize: size * 0.9, fontWeight: "700" as const, textAnchor: "middle" as const, dominantBaseline: "central" as const };
  const labelY = y + size * 1.9;

  switch (symbolKind) {
    case "ac": {
      const w = size * 2.2, h = size * 1.2;
      return (
        <g>
          <rect x={x - w/2} y={y - h/2} width={w} height={h} fill={fill} stroke={color} strokeWidth={sw2} />
          {([-h*0.2, 0, h*0.2] as number[]).map((dy, i) => (
            <line key={i} x1={x - w/2 + sw2} y1={y + dy} x2={x + w/2 - sw2} y2={y + dy} stroke={color} strokeWidth={sw * 0.8} />
          ))}
          {label && <text x={x} y={labelY} {...labelProps}>{label}</text>}
        </g>
      );
    }
    case "intake":
      return (
        <g>
          <circle cx={x} cy={y} r={size} fill={fill} stroke={color} strokeWidth={sw2} />
          <text x={x} y={y} {...iconProps}>↓</text>
          {label && <text x={x} y={labelY} {...labelProps}>{label}</text>}
        </g>
      );
    case "exhaust":
      return (
        <g>
          <circle cx={x} cy={y} r={size} fill={fill} stroke={color} strokeWidth={sw2} />
          <text x={x} y={y} {...iconProps}>↑</text>
          {label && <text x={x} y={labelY} {...labelProps}>{label}</text>}
        </g>
      );
    case "fan":
      return (
        <g>
          <circle cx={x} cy={y} r={size} fill={fill} stroke={color} strokeWidth={sw2} />
          <text x={x} y={y} {...iconProps}>⊕</text>
          {label && <text x={x} y={labelY} {...labelProps}>{label}</text>}
        </g>
      );
    case "louver": {
      const w = size * 2, h = size * 1.4;
      return (
        <g>
          <rect x={x - w/2} y={y - h/2} width={w} height={h} fill={fill} stroke={color} strokeWidth={sw2} />
          {([0.3, 0.5, 0.7] as number[]).map((t, i) => (
            <line key={i} x1={x - w/2 + sw2} y1={y - h/2 + h*t} x2={x + w/2 - sw2} y2={y - h/2 + h*t} stroke={color} strokeWidth={sw * 0.8} />
          ))}
          {label && <text x={x} y={labelY} {...labelProps}>{label}</text>}
        </g>
      );
    }
  }
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

// ─── 公開型 ──────────────────────────────────────────────────────────────────

export type FloorPlanResult = {
  file: File;
  imageDataUrl: string;
  imageSize: { w: number; h: number };
  annotations: Annotation[];
  eraserStrokes: EraserStroke[];
  title: string;
};

type Props = {
  initial?: {
    file: File;
    imageDataUrl: string;
    imageSize: { w: number; h: number };
    annotations: Annotation[];
    eraserStrokes: EraserStroke[];
    title?: string;
  };
  onConfirm: (result: FloorPlanResult) => void;
  onCancel: () => void;
};

// ─── メインコンポーネント ───────────────────────────────────────────────────

export default function FloorPlanModal({ initial, onConfirm, onCancel }: Props) {
  const [imageDataUrl,        setImageDataUrl]        = useState<string | null>(initial?.imageDataUrl ?? null);
  const [imageSize,           setImageSize]           = useState(initial?.imageSize ?? { w: 1, h: 1 });
  const [currentFile,         setCurrentFile]         = useState<File | null>(initial?.file ?? null);
  const [annotations,         setAnnotations]         = useState<Annotation[]>(initial?.annotations ?? []);
  const [eraserStrokes,       setEraserStrokes]       = useState<EraserStroke[]>(initial?.eraserStrokes ?? []);
  const [currentEraserPoints, setCurrentEraserPoints] = useState<{ x: number; y: number }[]>([]);
  const [isErasing,           setIsErasing]           = useState(false);
  const [eraserSize,          setEraserSize]          = useState<"s" | "m" | "l">("m");
  const [tool,                setTool]                = useState<Tool>("rect");
  const [color,               setColor]               = useState("#ef4444");
  const [selectedSymbolKind,  setSelectedSymbolKind]  = useState<SymbolKind>("ac");
  const [title,               setTitle]               = useState(initial?.title ?? "");
  const [selectedId,          setSelectedId]          = useState<string | null>(null);
  const [drag,                setDrag]                = useState<DragState | null>(null);
  const [pendingText,         setPendingText]         = useState<{ x: number; y: number } | null>(null);
  const [textInput,           setTextInput]           = useState("");
  const [svgCursor,           setSvgCursor]           = useState<{ x: number; y: number } | null>(null);
  const [isDragOver,          setIsDragOver]          = useState(false);
  const [zoom,                setZoom]                = useState(100);
  const [aiAnalyzing,         setAiAnalyzing]         = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const seqRef = useRef(0);
  function nextSeq() { return ++seqRef.current; }

  useEffect(() => {
    if (!initial) return;
    const maxSeq = Math.max(0, ...initial.annotations.map(a => a.seq), ...initial.eraserStrokes.map(s => s.seq));
    seqRef.current = maxSeq;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const fs = Math.max(imageSize.w, imageSize.h) * 0.022;
  const sw = fs * 0.15;
  const eraserWidths = { s: fs * 0.9, m: fs * 2, l: fs * 4 };

  // ─── ファイル読み込み ─────────────────────────────────────────────────────

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        setImageDataUrl(dataUrl);
        setCurrentFile(file);
        setAnnotations([]);
        setEraserStrokes([]);
        setSelectedId(null);
        seqRef.current = 0;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  // ─── 座標変換 ─────────────────────────────────────────────────────────────

  function toSvg(e: React.MouseEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width)  * imageSize.w,
      y: ((e.clientY - r.top)  / r.height) * imageSize.h,
    };
  }

  // ─── SVGマウスイベント ────────────────────────────────────────────────────

  function onSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const p = toSvg(e);
    if (tool === "eraser") { e.preventDefault(); setIsErasing(true); setCurrentEraserPoints([p]); return; }
    if (tool === "select") { setSelectedId(null); return; }
    if (tool === "text")   return;
    if (tool === "symbol") {
      e.preventDefault();
      const id = randomUUID(), seq = nextSeq();
      const size = Math.max(imageSize.w, imageSize.h) * 0.03;
      const defaultLabel = SYMBOL_KINDS.find(k => k.kind === selectedSymbolKind)?.label ?? "";
      setAnnotations(prev => [...prev, { id, seq, type: "symbol", x: p.x, y: p.y, symbolKind: selectedSymbolKind, label: defaultLabel, color, size }]);
      return;
    }
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
    if (tool === "eraser") {
      if (isErasing && currentEraserPoints.length > 0) {
        setEraserStrokes(prev => [...prev, { id: randomUUID(), seq: nextSeq(), points: currentEraserPoints, width: eraserWidths[eraserSize] }]);
      }
      setCurrentEraserPoints([]); setIsErasing(false); return;
    }
    if (tool === "text" && !drag) { setPendingText(toSvg(e)); setTextInput(""); return; }
    if (!drag || drag.mode !== "draw") { setDrag(null); return; }

    const { sx, sy, cx, cy } = drag;
    const minX = Math.min(sx, cx), minY = Math.min(sy, cy);
    const w = Math.abs(cx - sx), h = Math.abs(cy - sy);
    if (w > 5 || h > 5) {
      const id = randomUUID(), seq = nextSeq();
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
    const orig = annotations.find(a => a.id === id)!;
    setDrag({ mode: "move", id, sx: toSvg(e).x, sy: toSvg(e).y, orig });
  }

  function commitText() {
    if (!pendingText || !textInput.trim()) { setPendingText(null); return; }
    setAnnotations(prev => [...prev, { id: randomUUID(), seq: nextSeq(), type: "text", x: pendingText.x, y: pendingText.y, text: textInput.trim(), color }]);
    setPendingText(null); setTextInput("");
  }

  function deleteSelected() {
    if (!selectedId) return;
    setAnnotations(prev => prev.filter(a => a.id !== selectedId));
    setSelectedId(null);
  }

  function updateLabel(id: string, label: string) {
    setAnnotations(prev => prev.map(a => (a.id === id && (a.type === "rect" || a.type === "ellipse")) ? { ...a, label } : a));
  }

  function updateText(id: string, text: string) {
    setAnnotations(prev => prev.map(a => (a.id === id && a.type === "text") ? { ...a, text } : a));
  }

  function updateTextSize(id: string, fontSize: number) {
    setAnnotations(prev => prev.map(a => (a.id === id && a.type === "text") ? { ...a, fontSize } : a));
  }

  // ─── 描画 ─────────────────────────────────────────────────────────────────

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
      case "symbol":
        return (
          <g key={a.id} style={{ cursor: cur }} onMouseDown={onMD}>
            <SymbolShape x={a.x} y={a.y} symbolKind={a.symbolKind} label={a.label} color={a.color} size={a.size} isSel={isSel} sw={sw} fs={fs} />
            <rect x={a.x - a.size * 1.5} y={a.y - a.size * 1.5} width={a.size * 3} height={a.size * 3} fill="transparent" />
          </g>
        );
    }
  }

  const selectedA = annotations.find(a => a.id === selectedId);

  async function handleAiAnalysis(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAiAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("imageWidth",  String(imageSize.w));
      fd.append("imageHeight", String(imageSize.h));
      const res  = await fetch("/api/analyze-floor-plan", { method: "POST", body: fd });
      const json = await res.json() as { annotations?: Record<string, unknown>[]; error?: string };
      if (json.error) { alert(`AI解析エラー: ${json.error}`); return; }
      if (json.annotations?.length) {
        const added = json.annotations.map((a) => ({
          ...a,
          id:    randomUUID(),
          seq:   nextSeq(),
          color: "#ef4444",
        })) as Annotation[];
        setAnnotations(prev => [...prev, ...added]);
      } else {
        alert("図形が検出できませんでした。");
      }
    } catch (err) {
      alert(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiAnalyzing(false);
    }
  }

  function handleConfirm() {
    if (!currentFile || !imageDataUrl) return;
    onConfirm({ file: currentFile, imageDataUrl, imageSize, annotations, eraserStrokes, title });
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-white transition-colors ${isDragOver ? "bg-blue-50" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={handleDrop}
    >
      {/* ヘッダー */}
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-zinc-800">図面に書き込む</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="図面タイトル（例：エアコン配置）"
          className="h-8 w-52 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400"
        />
        <div className="ml-auto flex items-center gap-2">
          {imageDataUrl && (
            <>
              <button type="button" onClick={() => setZoom(z => Math.max(30, z - 10))}
                className="h-7 w-7 rounded border border-zinc-200 bg-white text-sm font-medium hover:bg-zinc-50">－</button>
              <span className="min-w-[3rem] text-center text-xs text-zinc-600">{zoom}%</span>
              <button type="button" onClick={() => setZoom(z => Math.min(200, z + 10))}
                className="h-7 w-7 rounded border border-zinc-200 bg-white text-sm font-medium hover:bg-zinc-50">＋</button>
              <span className="text-zinc-300">|</span>
            </>
          )}
          <button type="button" onClick={onCancel}
            className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50">
            キャンセル
          </button>
          <button type="button" onClick={handleConfirm} disabled={!imageDataUrl}
            className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
            確定
          </button>
        </div>
      </div>

      {/* ツールバー */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2">
        <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
          図面を読み込む
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>

        {imageDataUrl && (
          <label className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${aiAnalyzing ? "border-purple-200 bg-purple-50 text-purple-400 cursor-wait" : "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"}`}>
            {aiAnalyzing ? "🤖 解析中…" : "🤖 手書き写真をAI解析"}
            <input type="file" accept="image/*" className="hidden" disabled={aiAnalyzing} onChange={handleAiAnalysis} />
          </label>
        )}

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

            {tool === "symbol" && (
              <>
                <span className="text-zinc-300">|</span>
                {SYMBOL_KINDS.map(({ kind, label }) => (
                  <button key={kind} type="button" onClick={() => setSelectedSymbolKind(kind)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      selectedSymbolKind === kind
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}>
                    {label}
                  </button>
                ))}
              </>
            )}

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

            {selectedA && tool === "select" && (
              <>
                <span className="text-zinc-300">|</span>
                {(selectedA.type === "rect" || selectedA.type === "ellipse") && (
                  <input type="text" value={selectedA.label}
                    onChange={(e) => updateLabel(selectedId!, e.target.value)}
                    placeholder="ラベル"
                    className="h-8 w-28 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400" />
                )}
                {selectedA.type === "symbol" && (
                  <input type="text" value={selectedA.label}
                    onChange={(e) => setAnnotations(prev => prev.map(a => a.id === selectedId && a.type === "symbol" ? { ...a, label: e.target.value } : a))}
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
          </>
        )}
      </div>

      {/* キャンバス */}
      <div className="flex-1 overflow-auto bg-zinc-100 p-4">
        {!imageDataUrl ? (
          <label className={`flex h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white text-sm text-zinc-500 transition-colors ${isDragOver ? "border-blue-400 bg-blue-50 text-blue-600" : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50"}`}>
            <span className="text-3xl">🗺️</span>
            <span>{isDragOver ? "ここにドロップ" : "ここをクリック、またはドラッグ&ドロップで図面を読み込む"}</span>
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
                {annotations.map(a => (
                  <mask key={`mask-${a.id}`} id={`em-${a.id}`}>
                    <rect x="0" y="0" width={imageSize.w} height={imageSize.h} fill="white" />
                    {eraserStrokes.filter(s => s.seq > a.seq).map(s => (
                      <path key={s.id} d={pointsToPath(s.points)}
                        stroke="black" strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    ))}
                    {isErasing && currentEraserPoints.length > 1 && (
                      <path d={pointsToPath(currentEraserPoints)}
                        stroke="black" strokeWidth={eraserWidths[eraserSize]} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    )}
                  </mask>
                ))}
              </defs>

              {annotations.map(a => (
                <g key={`w-${a.id}`} mask={`url(#em-${a.id})`}>
                  {renderAnnotation(a)}
                </g>
              ))}
              {renderDraft()}

              {tool === "eraser" && svgCursor && (
                <circle
                  cx={svgCursor.x} cy={svgCursor.y} r={eraserWidths[eraserSize] / 2}
                  fill={isErasing ? "rgba(100,100,100,0.15)" : "rgba(100,100,100,0.08)"}
                  stroke="#888" strokeWidth={sw * 0.5} strokeDasharray={`${fs * 0.3} ${fs * 0.3}`}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </svg>

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
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
