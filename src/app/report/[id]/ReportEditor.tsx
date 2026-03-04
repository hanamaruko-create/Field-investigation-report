"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, DraftItem } from "@/lib/storage";
import { CONTRACTOR_NAME, COMPANY_ADDRESS, COMPANY_TEL, COMPANY_FAX } from "@/lib/constants";

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
        <div className="cover-page report-sheet mx-auto mb-8 flex w-full max-w-3xl flex-col items-center justify-center bg-white shadow-md print:mb-0 print:max-w-none print:shadow-none" style={{ minHeight: "297mm" }}>
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

          .cover-page {
            page-break-after: always;
            break-after: page;
            min-height: 100vh;
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
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}
