"use client";

import { useRef, useState } from "react";
import type { Draft, DraftItem } from "@/lib/storage";

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
  const [items, setItems] = useState<EditableItem[]>(
    draft.items.map((it) => ({ ...it, disclaimerText: it.disclaimerText ?? "" })),
  );
  const printAreaRef = useRef<HTMLDivElement>(null);

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
            href="/drafts"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ← 一覧へ
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
        <div
          ref={printAreaRef}
          className="report-sheet mx-auto w-full max-w-3xl bg-white shadow-md print:max-w-none print:shadow-none"
        >
          {/* ヘッダー */}
          <header className="border-b-2 border-zinc-800 px-10 py-8 print:px-8 print:py-6">
            <p className="text-xs tracking-[0.4em] text-zinc-500">現 地 調 査 報 告 書</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
              <EditableText
                value={projectName}
                onChange={setProjectName}
                className="w-full border-b border-dashed border-zinc-300 focus:border-zinc-600 focus:outline-none"
                placeholder="工事名称"
              />
            </h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-zinc-700">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">調査日</dt>
                <dd>
                  <input
                    type="date"
                    value={surveyDate}
                    onChange={(e) => setSurveyDate(e.target.value)}
                    className="border-b border-dashed border-zinc-300 bg-transparent focus:border-zinc-600 focus:outline-none print:hidden"
                  />
                  <span className="hidden print:inline">{formattedDate}</span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium">請負者</dt>
                <dd className="flex-1">
                  <EditableText
                    value={contractorName}
                    onChange={setContractorName}
                    className="w-full border-b border-dashed border-zinc-300 focus:border-zinc-600 focus:outline-none"
                    placeholder="請負者名"
                  />
                </dd>
              </div>
            </dl>
          </header>

          {/* 各撮影場所セクション */}
          <main className="divide-y divide-zinc-100 px-10 py-6 print:px-8">
            {items.map((item, idx) => {
              const cols = photoCols(item.photos.length);
              return (
                <section
                  key={item.id}
                  className="break-inside-avoid py-6 first:pt-0 last:pb-0"
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
                    {item.code ? (
                      <span className="shrink-0 text-xs text-zinc-500">
                        免責コード：{item.code}
                      </span>
                    ) : null}
                  </div>

                  {/* 写真グリッド（1枠内に全写真を均一サイズで配置） */}
                  <div className="overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 p-1.5">
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

          {/* フッター */}
          <footer className="border-t border-zinc-200 px-10 py-4 text-center text-xs text-zinc-400 print:px-8">
            本報告書は現地調査に基づき作成されました。
          </footer>
        </div>
      </div>

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

// インライン編集用テキストエリアコンポーネント
function EditableTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.max(3, value.split("\n").length)}
      className={`resize-y ${className ?? ""}`}
    />
  );
}
