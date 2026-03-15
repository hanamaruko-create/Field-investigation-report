"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISCLAIMER_TEXT_BY_CODE,
  buildDisclaimerTextFromCodes,
} from "@/lib/disclaimers";
import { CONTRACTOR_NAME, PROJECT_NAME, SURVEY_CONTENT_OPTIONS } from "@/lib/constants";
import FloorPlanModal, { type FloorPlanResult } from "./FloorPlanModal";
import type { Annotation, EraserStroke } from "@/lib/floorPlanTypes";
import { randomUUID } from "@/lib/uuid";
import { openCamera } from "@/lib/openCamera";
import ContinuousCamera from "./ContinuousCamera";

type EntryItem = {
  id: string;
  place: string;
  codes: string[];
  disclaimerText: string;
  disclaimerTouched: boolean;
  files: File[];
  previewUrls: string[];
};

function todayYyyyMmDd() {
  return new Date().toISOString().slice(0, 10);
}

function newItem(): EntryItem {
  return {
    id: randomUUID(),
    place: "",
    codes: [],
    disclaimerText: "",
    disclaimerTouched: false,
    files: [],
    previewUrls: [],
  };
}

export default function EntryPage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [surveyDate, setSurveyDate] = useState(todayYyyyMmDd());
  const [surveyContents, setSurveyContents] = useState<string[]>([]);
  const [surveyContentCustom, setSurveyContentCustom] = useState("");
  const [items, setItems] = useState<EntryItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type FPEntry = { id: string; title: string; file: File; imageDataUrl: string; imageSize: { w: number; h: number }; annotations: Annotation[]; eraserStrokes: EraserStroke[] };
  const [fpEntries,     setFpEntries]     = useState<FPEntry[]>([]);
  const [editingFPId,   setEditingFPId]   = useState<string | null>(null);
  const [showFPModal,   setShowFPModal]   = useState(false);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [shootingItemId, setShootingItemId] = useState<string | null>(null);

  function appendFiles(itemId: string, files: File[]) {
    if (!files.length) return;
    updateItem(itemId, (prev) => ({
      ...prev,
      files: [...prev.files, ...files],
      previewUrls: [...prev.previewUrls, ...files.map((f) => URL.createObjectURL(f))],
    }));
  }

  const knownCodes = useMemo(
    () => Object.keys(DISCLAIMER_TEXT_BY_CODE).sort(),
    [],
  );

  const canSubmit =
    !submitting &&
    surveyDate.trim().length > 0 &&
    items.length > 0 &&
    items.every((it) => it.place.trim().length > 0 && it.files.length > 0);

  function updateItem(id: string, updater: (prev: EntryItem) => EntryItem) {
    setItems((prev) => prev.map((it) => (it.id === id ? updater(it) : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((x) => x.id === id);
      target?.previewUrls.forEach((url) => URL.revokeObjectURL(url));
      const next = prev.filter((x) => x.id !== id);
      return next.length ? next : [newItem()];
    });
  }

  async function onSubmit() {
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("projectName", projectName);
      formData.set("surveyDate", surveyDate);
      formData.set("surveyContent", JSON.stringify(surveyContents));

      const allFiles: File[] = [];
      const payloadItems = items.map((it) => {
        const photoIndexes: number[] = [];
        for (const file of it.files) {
          photoIndexes.push(allFiles.length);
          allFiles.push(file);
        }
        return {
          place: it.place,
          code: it.codes.join(","),
          disclaimerText: it.disclaimerText,
          photoIndexes,
        };
      });

      formData.set("items", JSON.stringify(payloadItems));

      if (allFiles.length === 0) {
        throw new Error("写真が1枚も選択されていません");
      }
      for (const file of allFiles) {
        formData.append("photos", file, file.name);
      }
      // 図面ファイル（複数）
      for (let i = 0; i < fpEntries.length; i++) {
        const fp = fpEntries[i];
        formData.append(`floorPlan_${i}`, fp.file, fp.file.name);
        formData.set(`floorPlanData_${i}`, JSON.stringify({ title: fp.title, imageWidth: fp.imageSize.w, imageHeight: fp.imageSize.h, annotations: fp.annotations, eraserStrokes: fp.eraserStrokes }));
      }

      const res = await fetch("/api/drafts", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");

      for (const it of items) it.previewUrls.forEach((url) => URL.revokeObjectURL(url));
      router.push("/drafts");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                報告書入力（下書き作成）
              </h1>
              <p className="text-sm text-zinc-600">請負者：{CONTRACTOR_NAME}</p>
            </div>
            <a
              href="/"
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              ← トップへ
            </a>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">工事名称</span>
            <input
              type="text"
              placeholder="工事名称を入力"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700">調査日</span>
                <input
                  type="date"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                  value={surveyDate}
                  onChange={(e) => setSurveyDate(e.target.value)}
                />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-700">調査内容（複数選択可）</span>
                <div className="flex flex-wrap gap-2">
                  {SURVEY_CONTENT_OPTIONS.map((opt) => {
                    const active = surveyContents.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                        onClick={() =>
                          setSurveyContents((prev) =>
                            prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt],
                          )
                        }
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="その他（自由入力して追加）"
                    className="h-9 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                    value={surveyContentCustom}
                    onChange={(e) => setSurveyContentCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && surveyContentCustom.trim()) {
                        e.preventDefault();
                        const val = surveyContentCustom.trim();
                        if (!surveyContents.includes(val)) setSurveyContents((prev) => [...prev, val]);
                        setSurveyContentCustom("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
                    disabled={!surveyContentCustom.trim()}
                    onClick={() => {
                      const val = surveyContentCustom.trim();
                      if (val && !surveyContents.includes(val)) setSurveyContents((prev) => [...prev, val]);
                      setSurveyContentCustom("");
                    }}
                  >
                    追加
                  </button>
                </div>
                {surveyContents.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {surveyContents.map((v) => (
                      <span key={v} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {v}
                        <button
                          type="button"
                          className="text-zinc-400 hover:text-zinc-700"
                          onClick={() => setSurveyContents((prev) => prev.filter((x) => x !== v))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-50"
                onClick={() => setItems((prev) => [...prev, newItem()])}
              >
                追加
              </button>
              <button
                type="button"
                className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                disabled={!canSubmit}
                onClick={onSubmit}
              >
                {submitting ? "保存中…" : "保存して一覧へ"}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {items.map((it, idx) => (
            <section
              key={it.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <div className="text-sm font-semibold text-zinc-900">
                    セット {idx + 1}
                  </div>
                  <div className="text-xs text-zinc-500">
                    場所 + 免責（コード/文言） + 写真（複数可）
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                  onClick={() => removeItem(it.id)}
                >
                  削除
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-700">撮影場所</span>
                  <input
                    placeholder="例）精肉"
                    className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                    value={it.place}
                    onChange={(e) =>
                      updateItem(it.id, (prev) => ({ ...prev, place: e.target.value }))
                    }
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-700">
                    免責コード（複数選択可）
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {knownCodes.map((code) => {
                      const active = it.codes.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            active
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}
                          onClick={() =>
                            updateItem(it.id, (prev) => {
                              const exists = prev.codes.includes(code);
                              const nextCodes = exists
                                ? prev.codes.filter((c) => c !== code)
                                : [...prev.codes, code];
                              const shouldAuto =
                                !prev.disclaimerTouched ||
                                prev.disclaimerText.trim().length === 0;
                              return {
                                ...prev,
                                codes: nextCodes,
                                disclaimerText: shouldAuto
                                  ? buildDisclaimerTextFromCodes(nextCodes)
                                  : prev.disclaimerText,
                              };
                            })
                          }
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                  {it.codes.length > 0 ? (
                    <div className="text-xs text-zinc-600">
                      選択中: {it.codes.join(", ")}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">
                      必要な免責コードを選択してください。
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-sm font-medium text-zinc-700">免責文（編集可）</span>
                  <textarea
                    rows={3}
                    placeholder="（未記載の場合は空欄でもOK）"
                    className="resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-400"
                    value={it.disclaimerText}
                    onChange={(e) =>
                      updateItem(it.id, (prev) => ({
                        ...prev,
                        disclaimerText: e.target.value,
                        disclaimerTouched: true,
                      }))
                    }
                  />
                </label>

                <div className="flex flex-col gap-2 md:col-span-2">
                  <span className="text-sm font-medium text-zinc-700">写真</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 連続撮影モード */}
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                      onClick={() => setShootingItemId(it.id)}
                    >
                      📷 連続撮影
                    </button>
                    {/* ライブラリ／ファイル選択（複数可） */}
                    <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
                      🖼 ライブラリから選択
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { appendFiles(it.id, Array.from(e.target.files ?? [])); e.target.value = ""; }}
                      />
                    </label>
                    {it.files.length > 0 && (
                      <>
                        <span className="text-xs text-zinc-500">
                          {it.files.length}枚 / {Math.round(it.files.reduce((s, f) => s + f.size, 0) / 1024)} KB
                        </span>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:text-red-700"
                          onClick={() =>
                            updateItem(it.id, (prev) => {
                              prev.previewUrls.forEach((url) => URL.revokeObjectURL(url));
                              return { ...prev, files: [], previewUrls: [] };
                            })
                          }
                        >
                          クリア
                        </button>
                      </>
                    )}
                  </div>

                  {it.previewUrls.length > 0 ? (
                    <div
                      className={`grid grid-cols-2 gap-2 rounded-xl border-2 border-dashed p-1 transition-colors md:grid-cols-3 ${dragOverId === it.id ? "border-blue-400 bg-blue-50" : "border-transparent"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverId(it.id); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverId(null);
                        appendFiles(it.id, Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
                      }}
                    >
                      {it.previewUrls.map((url, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url + index.toString()}
                          src={url}
                          alt="プレビュー"
                          className="aspect-[4/3] w-full rounded-lg border border-zinc-200 bg-zinc-50 object-cover"
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`rounded-xl border-2 border-dashed px-4 py-10 text-center text-sm transition-colors ${dragOverId === it.id ? "border-blue-400 bg-blue-50 text-blue-600" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverId(it.id); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverId(null);
                        appendFiles(it.id, Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
                      }}
                    >
                      {dragOverId === it.id ? "ここにドロップして追加" : "画像をドラッグ＆ドロップ、またはボタンから選択"}
                    </div>
                  )}
                </div>

              </div>
            </section>
          ))}
        </div>
      </div>

      {/* 図面セクション（複数対応） */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="text-sm font-semibold text-zinc-900">図面（任意・複数可）</div>
            <div className="text-xs text-zinc-500">報告書の最後に追加されます</div>
          </div>
          <button type="button" onClick={() => { setEditingFPId(null); setShowFPModal(true); }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
            ＋ 図面を追加
          </button>
        </div>
        {fpEntries.length > 0 && (
          <div className="flex flex-col gap-2">
            {fpEntries.map((fp) => (
              <div key={fp.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fp.imageDataUrl} alt="図面" className="h-16 w-24 shrink-0 rounded object-contain border border-zinc-200 bg-white" />
                <span className="flex-1 text-sm text-zinc-700 truncate">
                  {fp.title || <span className="text-zinc-400">（タイトルなし）</span>}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setEditingFPId(fp.id); setShowFPModal(true); }}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-50">編集</button>
                  <button type="button" onClick={() => {
                    setFpEntries((prev) => {
                      const idx = prev.findIndex((e) => e.id === fp.id);
                      if (idx === -1) return prev;
                      const target = prev[idx];
                      const copy: typeof target = {
                        ...target,
                        id: randomUUID(),
                        title: target.title ? target.title + "（コピー）" : "（コピー）",
                        annotations: target.annotations.map(a => ({ ...a, id: randomUUID() })),
                      };
                      const next = [...prev];
                      next.splice(idx + 1, 0, copy);
                      return next;
                    });
                  }} className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-50">複製</button>
                  <button type="button" onClick={() => setFpEntries((prev) => prev.filter((e) => e.id !== fp.id))}
                    className="text-xs text-red-500 hover:text-red-700">削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 連続撮影オーバーレイ */}
      {shootingItemId !== null && (
        <ContinuousCamera
          onCommit={(files) => { appendFiles(shootingItemId, files); setShootingItemId(null); }}
          onCancel={() => setShootingItemId(null)}
        />
      )}

      {/* 図面アノテーションモーダル */}
      {showFPModal && (() => {
        const editing = editingFPId ? fpEntries.find((e) => e.id === editingFPId) : null;
        return (
          <FloorPlanModal
            initial={editing ? { file: editing.file, imageDataUrl: editing.imageDataUrl, imageSize: editing.imageSize, annotations: editing.annotations, eraserStrokes: editing.eraserStrokes, title: editing.title } : undefined}
            onConfirm={(result: FloorPlanResult) => {
              if (editingFPId) {
                setFpEntries((prev) => prev.map((e) => e.id === editingFPId ? { ...e, title: result.title, file: result.file, imageDataUrl: result.imageDataUrl, imageSize: result.imageSize, annotations: result.annotations, eraserStrokes: result.eraserStrokes } : e));
              } else {
                setFpEntries((prev) => [...prev, { id: randomUUID(), title: result.title, file: result.file, imageDataUrl: result.imageDataUrl, imageSize: result.imageSize, annotations: result.annotations, eraserStrokes: result.eraserStrokes }]);
              }
              setShowFPModal(false);
            }}
            onCancel={() => setShowFPModal(false)}
          />
        );
      })()}
    </div>
  );
}
