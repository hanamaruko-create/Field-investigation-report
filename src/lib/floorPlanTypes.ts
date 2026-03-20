// 図面アノテーションで使用する共有型定義

export type RectA    = { id: string; seq: number; type: "rect";    x: number;  y: number;  w: number;  h: number;  label: string; color: string };
export type EllipseA = { id: string; seq: number; type: "ellipse"; cx: number; cy: number; rx: number; ry: number; label: string; color: string };
export type LineA    = { id: string; seq: number; type: "line";    x1: number; y1: number; x2: number; y2: number; color: string };
export type ArrowA   = { id: string; seq: number; type: "arrow";   x1: number; y1: number; x2: number; y2: number; color: string };
export type TextA    = { id: string; seq: number; type: "text";    x: number;  y: number;  text: string; fontSize?: number; color: string };
export type SymbolKind = "ac" | "intake" | "exhaust" | "fan" | "louver";
export type SymbolA  = { id: string; seq: number; type: "symbol";  x: number;  y: number;  symbolKind: SymbolKind; label: string; color: string; size: number };
export type Annotation = RectA | EllipseA | LineA | ArrowA | TextA | SymbolA;

export type EraserStroke = { id: string; seq: number; points: { x: number; y: number }[]; width: number };

export type StoredFloorPlan = {
  filename: string;
  title?: string;
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  eraserStrokes: EraserStroke[];
};
