"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, DraftItem } from "@/lib/storage";
import { CONTRACTOR_NAME, COMPANY_ADDRESS, COMPANY_TEL, COMPANY_FAX } from "@/lib/constants";
import FloorPlanModal, { type FloorPlanResult } from "@/app/entry/FloorPlanModal";
import type { Annotation, EraserStroke } from "@/lib/floorPlanTypes";
import { openCamera } from "@/lib/openCamera";

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

  // 図面（プレビュー内で追加・複数管理可能）
  type EditorFP = { filename: string; imageUrl: string; imageWidth: number; imageHeight: number; annotations: Annotation[]; eraserStrokes: EraserStroke[] };
  const [editorFPs, setEditorFPs] = useState<EditorFP[]>(
    (draft.floorPlans ?? []).map((fp) => ({
      filename: fp.filename,
      imageUrl: `/api/uploads/${fp.filename}`,
      imageWidth: fp.imageWidth,
      imageHeight: fp.imageHeight,
      annotations: fp.annotations,
      eraserStrokes: fp.eraserStrokes,
    })),
  );
  const [showFPModal, setShowFPModal] = useState(false);

  // 撮影場所追加フォーム
  const [addingItem, setAddingItem] = useState(false);
  const [newPlace, setNewPlace] = useState("");
  const [newDisclaimer, setNewDisclaimer] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [newDragOver, setNewDragOver] = useState(false);

  function appendNewFiles(files: File[]) {
    if (!files.length) return;
    setNewFiles((prev) => [...prev, ...files]);
    setNewPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  }

  function resetNewItem() {
    newPreviews.forEach((u) => URL.revokeObjectURL(u));
    setAddingItem(false); setNewPlace(""); setNewDisclaimer("");
    setNewFiles([]); setNewPreviews([]);
  }

  async function submitNewItem() {
    if (!newPlace.trim()) return;
    const fd = new FormData();
    fd.append("action", "add-item");
    fd.append("place", newPlace.trim());
    fd.append("disclaimerText", newDisclaimer);
    for (const f of newFiles) fd.append("photos", f, f.name);
    const res = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    const json = await res.json() as { ok: boolean; item?: EditableItem };
    if (json.ok && json.item) {
      setItems((prev) => [...prev, { ...json.item!, disclaimerText: json.item!.disclaimerText ?? "" }]);
    }
    resetNewItem();
  }

  async function addPhotos(itemId: string, files: File[]) {
    if (!files.length) return;
    const fd = new FormData();
    fd.append("action", "add-photos");
    fd.append("itemId", itemId);
    for (const f of files) fd.append("photos", f, f.name);
    const res = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    const json = await res.json() as { ok: boolean; photos?: { filename: string; originalName: string; mimeType: string; size: number }[] };
    if (json.ok && json.photos) {
      setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, photos: [...it.photos, ...json.photos!] } : it));
    }
  }

  async function removePhoto(itemId: string, filename: string) {
    const fd = new FormData();
    fd.append("action", "remove-photo");
    fd.append("itemId", itemId);
    fd.append("filename", filename);
    await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, photos: it.photos.filter((p) => p.filename !== filename) } : it));
  }

  async function addFP(result: FloorPlanResult) {
    const fd = new FormData();
    fd.append("action", "add-floor-plan");
    fd.append("floorPlan", result.file);
    fd.append("floorPlanData", JSON.stringify({
      imageWidth: result.imageSize.w,
      imageHeight: result.imageSize.h,
      annotations: result.annotations,
      eraserStrokes: result.eraserStrokes,
    }));
    const res = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    const json = await res.json() as { ok: boolean; floorPlan?: { filename: string } };
    const filename = json.floorPlan?.filename ?? "";
    setEditorFPs((prev) => [...prev, {
      filename,
      imageUrl: filename ? `/api/uploads/${filename}` : result.imageDataUrl,
      imageWidth: result.imageSize.w,
      imageHeight: result.imageSize.h,
      annotations: result.annotations,
      eraserStrokes: result.eraserStrokes,
    }]);
    setShowFPModal(false);
  }

  async function deleteFP(filename: string) {
    const fd = new FormData();
    fd.append("action", "delete-floor-plan");
    fd.append("filename", filename);
    await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", body: fd });
    setEditorFPs((prev) => prev.filter((fp) => fp.filename !== filename));
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
                        <div key={photo.filename} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/uploads/${photo.filename}`}
                            alt={`${item.place} の写真`}
                            style={{ aspectRatio: "4/3" }}
                            className="w-full rounded object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(item.id, photo.filename)}
                            className="no-print absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* 写真追加ボタン（印刷時非表示） */}
                  <div className="no-print mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      onClick={() => openCamera((files) => addPhotos(item.id, files))}
                    >
                      📷 カメラで撮影
                    </button>
                    <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                      🖼 写真を追加
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => { addPhotos(item.id, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                    </label>
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
            {/* 撮影場所追加フォーム */}
            {addingItem && (
              <section className="no-print py-6 border-t border-zinc-100">
                <p className="mb-3 text-sm font-semibold text-zinc-700">新しい撮影場所を追加</p>
                <div className="flex flex-col gap-3">
                  <input
                    type="text" placeholder="撮影場所" value={newPlace}
                    onChange={(e) => setNewPlace(e.target.value)}
                    className="h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
                  />
                  <textarea
                    placeholder="免責事項（任意）" value={newDisclaimer} rows={2}
                    onChange={(e) => setNewDisclaimer(e.target.value)}
                    className="resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      onClick={() => openCamera(appendNewFiles)}
                    >
                      📷 カメラで撮影
                    </button>
                    <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                      🖼 写真を追加
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => { appendNewFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                    </label>
                  </div>
                  <div
                    className={`rounded-xl border-2 border-dashed p-2 transition-colors ${newDragOver ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}
                    onDragOver={(e) => { e.preventDefault(); setNewDragOver(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setNewDragOver(false); }}
                    onDrop={(e) => { e.preventDefault(); setNewDragOver(false); appendNewFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"))); }}
                  >
                    {newPreviews.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {newPreviews.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={url} alt="" style={{ aspectRatio: "4/3" }} className="w-full rounded object-cover" />
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-400">
                        {newDragOver ? "ここにドロップ" : "ここに写真をドラッグ＆ドロップ"}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={submitNewItem} disabled={!newPlace.trim()}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
                      追加して保存
                    </button>
                    <button type="button" onClick={resetNewItem}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                      キャンセル
                    </button>
                  </div>
                </div>
              </section>
            )}
            {!addingItem && (
              <div className="no-print py-4 text-center">
                <button type="button" onClick={() => setAddingItem(true)}
                  className="rounded-lg border border-dashed border-zinc-300 px-5 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700">
                  ＋ 撮影場所を追加
                </button>
              </div>
            )}
          </main>

          {/* 図面（複数・報告書の最後） */}
          {editorFPs.map((fp, fpIdx) => (
            <section key={fp.filename || fpIdx} className="break-inside-avoid border-t border-zinc-100 px-10 py-6 print:px-8">
              <div className="mb-3 flex items-center gap-3">
                <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-white">
                  図面{editorFPs.length > 1 ? `　${fpIdx + 1}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => deleteFP(fp.filename)}
                  className="no-print text-xs text-red-500 hover:text-red-700"
                >
                  削除
                </button>
              </div>
              {(() => {
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
                          <mask key={`fm-${a.id}`} id={`fp${fpIdx}-${a.id}`}>
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
                        return <g key={a.id} mask={`url(#fp${fpIdx}-${a.id})`}>{node}</g>;
                      })}
                    </svg>
                  </div>
                );
              })()}
            </section>
          ))}

          {/* 図面追加ボタン */}
          <div className="no-print border-t border-zinc-100 px-10 py-4 print:px-8">
            <button
              type="button"
              onClick={() => setShowFPModal(true)}
              className="rounded-lg border border-dashed border-zinc-300 px-5 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              ＋ 図面を追加
            </button>
          </div>

          {/* フッター */}
          <footer className="border-t border-zinc-200 px-10 py-4 text-center text-xs text-zinc-400 print:px-8">
            本報告書は現地調査に基づき作成されました。
          </footer>
        </div>
      </div>

      {/* 図面アノテーションモーダル */}
      {showFPModal && (
        <FloorPlanModal
          onConfirm={addFP}
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
