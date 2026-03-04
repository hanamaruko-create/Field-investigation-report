"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, DraftItem } from "@/lib/storage";
import { CONTRACTOR_NAME, COMPANY_ADDRESS, COMPANY_TEL, COMPANY_FAX } from "@/lib/constants";
import FloorPlanModal, { type FloorPlanResult } from "@/app/entry/FloorPlanModal";
import type { Annotation, EraserStroke } from "@/lib/floorPlanTypes";

// 写真枚数に応じた列数を決定
function photoCols(n: number): number {
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n === 4) return 2;
  return 3;
}

type EditableItem = Omit<DraftItem, "photos"> & {
  photos: DraftItem["photos"];
  disclaimerText: string;
};

type Props = { draft: Draft };

export default function ReportEditor({ draft }: Props) {
  const [projectName, setProjectName] = useState(draft.projectName);
  const [contractorName, setContractorName] = useState(draft.contractorName);
  const [surveyDate, setSurveyDate] = useState(draft.surveyDate);
  const [surveyContents, setSurveyContents] = useState<string[]>(
    Array.isArray(draft.surveyContent) ? draft.surveyContent : [],
  );
  const [items, setItems] = useState<EditableItem[]>(
    draft.items.map((it) => ({ ...it, disclaimerText: it.disclaimerText ?? "" })),
  );
  const printAreaRef = useRef<HTMLDivElement>(null);

  // 図面（プレビュー内で追加・変更可能）
  type EditorFP = { imageUrl: string; imageWidth: number; imageHeight: number; annotations: Annotation[]; eraserStrokes: EraserStroke[] };
  const [editorFP, setEditorFP] = useState<EditorFP | null>(
    draft.floorPlan
      ? { imageUrl: `/api/uploads/${draft.floorPlan.filename}`, imageWidth: draft.floorPlan.imageWidth, imageHeight: draft.floorPlan.imageHeight, annotations: draft.floorPlan.annotations, eraserStrokes: draft.floorPlan.eraserStrokes }
      : null,
  );
  const [showFPModal, setShowFPModal] = useState(false);

  async function saveFP(result: FloorPlanResult) {
    const fd = new FormData();
    fd.append("floorPlan", result.file);
    fd.append("floorPlanData", JSON.stringify({
      imageWidth: result.imageSize.w,
      imageHeight: result.imageSize.h,
      annotations: result.annotations,
      eraserStrokes: result.eraserStrokes,
    }));
    const res = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    const json = await res.json() as { ok: boolean; filename?: string };
    setEditorFP({
      imageUrl: json.filename ? `/api/uploads/${json.filename}` : result.imageDataUrl,
      imageWidth: result.imageSize.w,
      imageHeight: result.imageSize.h,
      annotations: result.annotations,
      eraserStrokes: result.eraserStrokes,
    });
    setShowFPModal(false);
  }

  async function deleteFP() {
    const fd = new FormData();
    fd.append("action", "delete-floor-plan");
    await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    setEditorFP(null);
  }

  function updateItem(id: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handlePrint() {
    window.print();
  }

  const formattedDate = surveyDate
    ? new Date(surveyDate + "T00:00:00").toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <>
      {/* 印刷時に非表示になるコントロールバー */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3 shadow-sm">
        <span className="text-sm font-medium text-zinc-700">
          報告書プレビュー・編集モード
          <span className="ml-2 text-xs font-normal text-zinc-500">
            各テキストをクリックして直接編集できます
          </span>
        </span>
        <div className="flex gap-2">
          <a
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ← トップへ
          </a>
          <a
            href="/drafts"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            一覧へ
          </a>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF出力（印刷）
          </button>
        </div>
      </div>

      {/* 報告書本体 */}
      <div className="bg-zinc-100 py-8 print:bg-white print:py-0">
        {/* 表紙 */}
        <div className="cover-page report-sheet mx-auto mb-8 flex w-full max-w-3xl flex-col items-center justify-center bg-white shadow-md print:mb-0 print:max-w-none print:shadow-none" style={{ minHeight: "273mm" }}>
          <div className="flex flex-col items-center gap-10 px-16 text-center">
            <p className="text-sm tracking-[0.5em] text-zinc-400">SITE INVESTIGATION REPORT</p>
            <h1 className="text-5xl font-bold tracking-[0.3em] text-zinc-900">現地調査報告書</h1>
            <dl className="mt-4 w-full max-w-md space-y-6 border-y border-zinc-300 py-10 text-left text-sm">
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 font-medium text-zinc-600">工事名称</dt>
                <dd className="flex-1">
                  <EditableText
                    value={projectName}
                    onChange={setProjectName}
                    className="w-full border-b border-dashed border-zinc-300 text-zinc-900 focus:border-zinc-600 focus:outline-none"
                    placeholder="工事名称を入力"
                  />
                </dd>
              </div>
              {surveyContents.length > 0 && (
                <div className="flex gap-4">
                  <dt className="w-20 shrink-0 font-medium text-zinc-600">調査内容</dt>
                  <dd className="flex-1 text-zinc-900">
                    {surveyContents.join("・")}
                  </dd>
                </div>
              )}
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 font-medium text-zinc-600">調査日</dt>
                <dd className="flex-1">
                  <input
                    type="date"
                    value={surveyDate}
                    onChange={(e) => setSurveyDate(e.target.value)}
                    className="border-b border-dashed border-zinc-300 bg-transparent text-zinc-900 focus:border-zinc-600 focus:outline-none print:hidden"
                  />
                  <span className="hidden print:inline">{formattedDate}</span>
                </dd>
              </div>
            </dl>
            <div className="space-y-1 text-sm text-zinc-600">
              <p className="font-semibold text-zinc-800">請負者：{CONTRACTOR_NAME}</p>
              <p>{COMPANY_ADDRESS}</p>
              <p>TEL: {COMPANY_TEL} / FAX: {COMPANY_FAX}</p>
            </div>
          </div>
        </div>

        <div
          ref={printAreaRef}
          className="report-sheet mx-auto w-full max-w-3xl bg-white shadow-md print:max-w-none print:shadow-none"
        >

          {/* 各撮影場所セクション */}
          <main className="divide-y divide-zinc-100 px-10 py-6 print:px-8">
            {items.map((item, idx) => {
              const cols = photoCols(item.photos.length);
              return (
                <section
                  key={item.id}
                  className="py-6 first:pt-0 last:pb-0"
                >
                  {/* 場所ラベル */}
                  <div className="mb-3 flex items-baseline gap-3">
                    <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <EditableText
                      value={item.place}
                      onChange={(v) => updateItem(item.id, { place: v })}
                      className="flex-1 border-b border-dashed border-zinc-300 text-base font-bold text-zinc-900 focus:border-zinc-600 focus:outline-none"
                      placeholder="撮影場所"
                    />
                  </div>

                  {/* 写真グリッド（1枠内に全写真を均一サイズで配置） */}
                  <div className="break-inside-avoid overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 p-1.5">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gap: "6px",
                      }}
                    >
                      {item.photos.map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.filename}
                          src={`/api/uploads/${photo.filename}`}
                          alt={`${item.place} の写真`}
                          style={{ aspectRatio: "4/3" }}
                          className="w-full rounded object-cover"
                        />
                      ))}
                    </div>
                  </div>

                  {/* 免責文 */}
                  {item.disclaimerText ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-medium text-zinc-500">免責事項</p>
                      <EditableTextarea
                        value={item.disclaimerText}
                        onChange={(v) => updateItem(item.id, { disclaimerText: v })}
                        className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700 focus:border-zinc-400 focus:outline-none"
                      />
                    </div>
                  ) : null}
                </section>
              );
            })}
          </main>

          {/* 図面（報告書の最後） */}
          <section className="break-inside-avoid border-t border-zinc-100 px-10 py-6 print:px-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-white">図面</span>
              <button
                type="button"
                onClick={() => setShowFPModal(true)}
                className="no-print rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {editorFP ? "図面を変更" : "図面を追加"}
              </button>
              {editorFP && (
                <button
                  type="button"
                  onClick={deleteFP}
                  className="no-print text-xs text-red-500 hover:text-red-700"
                >
                  削除
                </button>
              )}
            </div>

            {editorFP && (() => {
              const fp = editorFP;
              const imgMax = Math.max(fp.imageWidth, fp.imageHeight);
              const fSize  = imgMax * 0.022;
              const sWidth = fSize * 0.15;
              const tp = (color: string) => ({
                fill: color, fontSize: fSize, fontWeight: "700" as const,
                paintOrder: "stroke" as const, stroke: "white", strokeWidth: fSize * 0.25,
              });
              return (
                <div className="relative inline-block w-full overflow-hidden rounded-lg border border-zinc-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fp.imageUrl} alt="図面"
                    style={{ display: "block", width: "100%", userSelect: "none", pointerEvents: "none" }} />
                  <svg viewBox={`0 0 ${fp.imageWidth} ${fp.imageHeight}`}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    <defs>
                      {fp.annotations.map((a) => (
                        <mask key={`fm-${a.id}`} id={`fp-${a.id}`}>
                          <rect x="0" y="0" width={fp.imageWidth} height={fp.imageHeight} fill="white" />
                          {fp.eraserStrokes.filter((s) => s.seq > a.seq).map((s) => (
                            <path key={s.id}
                              d={s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                              stroke="black" strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          ))}
                        </mask>
                      ))}
                    </defs>
                    {fp.annotations.map((a) => {
                      const sw2 = sWidth * 1.5;
                      const node = (() => {
                        switch (a.type) {
                          case "rect": return (
                            <g>
                              <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={sw2} />
                              {a.label && <text x={a.x + sWidth} y={a.y - sWidth} {...tp(a.color)}>{a.label}</text>}
                            </g>
                          );
                          case "ellipse": return (
                            <g>
                              <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} fill="none" stroke={a.color} strokeWidth={sw2} />
                              {a.label && <text x={a.cx - a.rx + sWidth} y={a.cy - a.ry - sWidth} {...tp(a.color)}>{a.label}</text>}
                            </g>
                          );
                          case "line": return (
                            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={sw2} strokeLinecap="round" />
                          );
                          case "arrow": {
                            const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), sp = Math.PI / 6, sz = fSize * 0.8;
                            return (
                              <g>
                                <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={sw2} strokeLinecap="round" />
                                <polygon
                                  points={`${a.x2},${a.y2} ${a.x2 - sz * Math.cos(ang - sp)},${a.y2 - sz * Math.sin(ang - sp)} ${a.x2 - sz * Math.cos(ang + sp)},${a.y2 - sz * Math.sin(ang + sp)}`}
                                  fill={a.color} />
                              </g>
                            );
                          }
                          case "text": {
                            const tfs = a.fontSize ?? fSize;
                            return (
                              <text x={a.x} y={a.y}
                                fill={a.color} fontSize={tfs} fontWeight="700" paintOrder="stroke" stroke="white" strokeWidth={tfs * 0.25}
                                style={{ userSelect: "none" }}>{a.text}</text>
                            );
                          }
                        }
                      })();
                      return <g key={a.id} mask={`url(#fp-${a.id})`}>{node}</g>;
                    })}
                  </svg>
                </div>
              );
            })()}
          </section>

          {/* フッター */}
          <footer className="border-t border-zinc-200 px-10 py-4 text-center text-xs text-zinc-400 print:px-8">
            本報告書は現地調査に基づき作成されました。
          </footer>
        </div>
      </div>

      {/* 図面アノテーションモーダル */}
      {showFPModal && (
        <FloorPlanModal
          onConfirm={saveFP}
          onCancel={() => setShowFPModal(false)}
        />
      )}

      {/* 印刷用グローバルスタイル */}
      <style>{`
        @media print {
          .no-print { display: none !important; }

          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .report-sheet {
            box-shadow: none !important;
            max-width: none !important;
            width: 100% !important;
          }

          .cover-page {
            page-break-after: always;
            break-after: page;
            min-height: calc(297mm - 24mm);
            margin-bottom: 0 !important;
          }
        }
      `}</style>
    </>
  );
}

// インライン編集用テキスト入力コンポーネント
function EditableText({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={placeholder}
    />
  );
}

// インライン編集用テキストエリアコンポーネント（高さ自動調整）
function EditableTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        className={`resize-none overflow-hidden print:hidden ${className ?? ""}`}
      />
      <div
        aria-hidden="true"
        className={`hidden whitespace-pre-wrap print:block ${className ?? ""}`}
      >
        {value}
      </div>
    </>
  );
}
