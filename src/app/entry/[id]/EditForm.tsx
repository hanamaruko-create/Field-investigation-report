"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISCLAIMER_TEXT_BY_CODE,
  buildDisclaimerTextFromCodes,
} from "@/lib/disclaimers";
import { CONTRACTOR_NAME, SURVEY_CONTENT_OPTIONS } from "@/lib/constants";
import type { Draft, StoredPhoto } from "@/lib/storage";
import { randomUUID } from "@/lib/uuid";
import { openCamera } from "@/lib/openCamera";
import ContinuousCamera from "@/app/entry/ContinuousCamera";

type EditItem = {
  id: string | null;
  place: string;
  codes: string[];
  disclaimerText: string;
  disclaimerTouched: boolean;
  existingPhotos: StoredPhoto[];
  newFiles: File[];
  newPreviewUrls: string[];
};

function newItem(): EditItem {
  return {
    id: null, place: "", codes: [], disclaimerText: "",
    disclaimerTouched: false, existingPhotos: [], newFiles: [], newPreviewUrls: [],
  };
}

export default function EditForm({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [projectName, setProjectName] = useState(draft.projectName);
  const [surveyDate, setSurveyDate] = useState(draft.surveyDate);
  const [surveyContents, setSurveyContents] = useState<string[]>(
    Array.isArray(draft.surveyContent) ? draft.surveyContent : [],
  );
  const [surveyContentCustom, setSurveyContentCustom] = useState("");
  const [items, setItems] = useState<EditItem[]>(() =>
    draft.items.map((it) => ({
      id: it.id,
      place: it.place,
      codes: it.code ? it.code.split(",").filter(Boolean) : [],
      disclaimerText: it.disclaimerText ?? "",
      disclaimerTouched: !!(it.disclaimerText),
      existingPhotos: it.photos,
      newFiles: [],
      newPreviewUrls: [],
    })),
  );
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [shootingItemId, setShootingItemId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownCodes = useMemo(() => Object.keys(DISCLAIMER_TEXT_BY_CODE).sort(), []);

  const canSubmit =
    !submitting &&
    surveyDate.trim().length > 0 &&
    items.length > 0 &&
    items.every((it) => it.place.trim().length > 0 && (it.existingPhotos.length + it.newFiles.length) > 0);

  function updateItemByIndex(idx: number, updater: (prev: EditItem) => EditItem) {
    setItems((prev) => prev.map((it, i) => i === idx ? updater(it) : it));
  }

  function appendFiles(idx: number, files: File[]) {
    if (!files.length) return;
    updateItemByIndex(idx, (prev) => ({
      ...prev,
      newFiles: [...prev.newFiles, ...files],
      newPreviewUrls: [...prev.newPreviewUrls, ...files.map((f) => URL.createObjectURL(f))],
    }));
  }

  function removeExistingPhoto(idx: number, filename: string) {
    updateItemByIndex(idx, (prev) => ({
      ...prev,
      existingPhotos: prev.existingPhotos.filter((p) => p.filename !== filename),
    }));
  }

  function removeNewPhoto(idx: number, fileIdx: number) {
    updateItemByIndex(idx, (prev) => {
      URL.revokeObjectURL(prev.newPreviewUrls[fileIdx]);
      return {
        ...prev,
        newFiles: prev.newFiles.filter((_, i) => i !== fileIdx),
        newPreviewUrls: prev.newPreviewUrls.filter((_, i) => i !== fileIdx),
      };
    });
  }

  function removeItem(idx: number) {
    setItems((prev) => {
      const target = prev[idx];
      target.newPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [newItem()];
    });
  }

  async function onSubmit() {
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("projectName", projectName);
      fd.set("surveyDate", surveyDate);
      fd.set("surveyContent", JSON.stringify(surveyContents));
      fd.set("items", JSON.stringify(items.map((it) => ({
        id: it.id,
        place: it.place,
        code: it.codes.join(","),
        disclaimerText: it.disclaimerText,
        keepFilenames: it.existingPhotos.map((p) => p.filename),
      }))));
      for (let i = 0; i < items.length; i++) {
        for (const f of items[i].newFiles) fd.append(`photos_${i}`, f, f.name);
      }
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "PUT", body: fd });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      items.forEach((it) => it.newPreviewUrls.forEach((u) => URL.revokeObjectURL(u)));
      router.push("/drafts");
    } catch (e) {
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
              <h1 className="text-2xl font-semibold tracking-tight">報告書を編集</h1>
              <p className="text-sm text-zinc-600">請負者：{CONTRACTOR_NAME}</p>
            </div>
            <a href="/drafts"
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50">
              ← 一覧へ
            </a>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">工事名称</span>
            <input type="text" placeholder="工事名称を入力"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
              value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-700">調査日</span>
                <input type="date"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                  value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-700">調査内容（複数選択可）</span>
                <div className="flex flex-wrap gap-2">
                  {SURVEY_CONTENT_OPTIONS.map((opt) => {
                    const active = surveyContents.includes(opt);
                    return (
                      <button key={opt} type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                        onClick={() => setSurveyContents((prev) => prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt])}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="その他（自由入力して追加）"
                    className="h-9 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                    value={surveyContentCustom} onChange={(e) => setSurveyContentCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && surveyContentCustom.trim()) {
                        e.preventDefault();
                        const val = surveyContentCustom.trim();
                        if (!surveyContents.includes(val)) setSurveyContents((prev) => [...prev, val]);
                        setSurveyContentCustom("");
                      }
                    }} />
                  <button type="button" disabled={!surveyContentCustom.trim()}
                    className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
                    onClick={() => {
                      const val = surveyContentCustom.trim();
                      if (val && !surveyContents.includes(val)) setSurveyContents((prev) => [...prev, val]);
                      setSurveyContentCustom("");
                    }}>追加</button>
                </div>
                {surveyContents.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {surveyContents.map((v) => (
                      <span key={v} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {v}
                        <button type="button" className="text-zinc-400 hover:text-zinc-700"
                          onClick={() => setSurveyContents((prev) => prev.filter((x) => x !== v))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-50"
                onClick={() => setItems((prev) => [...prev, newItem()])}>
                セット追加
              </button>
              <button type="button" disabled={!canSubmit} onClick={onSubmit}
                className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50">
                {submitting ? "保存中…" : "保存して一覧へ"}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-col gap-4">
          {items.map((it, idx) => {
            const itemKey = it.id ?? `new-${idx}`;
            const totalPhotos = it.existingPhotos.length + it.newFiles.length;
            return (
              <section key={itemKey} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <div className="text-sm font-semibold text-zinc-900">セット {idx + 1}</div>
                    <div className="text-xs text-zinc-500">場所 + 免責 + 写真</div>
                  </div>
                  <button type="button" onClick={() => removeItem(idx)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                    削除
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-700">撮影場所</span>
                    <input placeholder="例）精肉"
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                      value={it.place}
                      onChange={(e) => updateItemByIndex(idx, (prev) => ({ ...prev, place: e.target.value }))} />
                  </label>

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-zinc-700">免責コード（複数選択可）</span>
                    <div className="flex flex-wrap gap-2">
                      {knownCodes.map((code) => {
                        const active = it.codes.includes(code);
                        return (
                          <button key={code} type="button"
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                            onClick={() =>
                              updateItemByIndex(idx, (prev) => {
                                const exists = prev.codes.includes(code);
                                const nextCodes = exists ? prev.codes.filter((c) => c !== code) : [...prev.codes, code];
                                const shouldAuto = !prev.disclaimerTouched || prev.disclaimerText.trim().length === 0;
                                return { ...prev, codes: nextCodes, disclaimerText: shouldAuto ? buildDisclaimerTextFromCodes(nextCodes) : prev.disclaimerText };
                              })
                            }>
                            {code}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm font-medium text-zinc-700">免責文（編集可）</span>
                    <textarea rows={3} placeholder="（未記載の場合は空欄でもOK）"
                      className="resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-400"
                      value={it.disclaimerText}
                      onChange={(e) => updateItemByIndex(idx, (prev) => ({ ...prev, disclaimerText: e.target.value, disclaimerTouched: true }))} />
                  </label>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-sm font-medium text-zinc-700">写真</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                        onClick={() => setShootingItemId(String(idx))}
                      >
                        📷 連続撮影
                      </button>
                      <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
                        🖼 ライブラリから選択
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => { appendFiles(idx, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                      </label>
                      {totalPhotos > 0 && (
                        <span className="text-xs text-zinc-500">{totalPhotos}枚</span>
                      )}
                    </div>

                    <div
                      className={`rounded-xl border-2 border-dashed p-2 transition-colors ${dragOverId === itemKey ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverId(itemKey); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOverId(null);
                        appendFiles(idx, Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
                      }}
                    >
                      {totalPhotos > 0 ? (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                          {it.existingPhotos.map((photo) => (
                            <div key={photo.filename} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/api/uploads/${photo.filename}`} alt=""
                                className="aspect-[4/3] w-full rounded-lg border border-zinc-200 object-cover" />
                              <button type="button" onClick={() => removeExistingPhoto(idx, photo.filename)}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80">
                                ×
                              </button>
                            </div>
                          ))}
                          {it.newPreviewUrls.map((url, fi) => (
                            <div key={url} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt=""
                                className="aspect-[4/3] w-full rounded-lg border border-blue-200 object-cover" />
                              <button type="button" onClick={() => removeNewPhoto(idx, fi)}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80">
                                ×
                              </button>
                              <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1 text-[10px] text-white">新規</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-8 text-center text-sm text-zinc-400">
                          {dragOverId === itemKey ? "ここにドロップ" : "写真をドラッグ＆ドロップ、またはボタンから選択"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* 連続撮影オーバーレイ */}
      {shootingItemId !== null && (
        <ContinuousCamera
          onCommit={(files) => { appendFiles(Number(shootingItemId), files); setShootingItemId(null); }}
          onCancel={() => setShootingItemId(null)}
        />
      )}
    </div>
  );
}
