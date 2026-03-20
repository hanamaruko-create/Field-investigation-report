"use client";

import { useEffect, useState } from "react";
import { randomUUID } from "@/lib/uuid";

// ── 撮影ステップ定義 ──────────────────────────────────────────────

type PhotoStep = {
  key: string;
  instruction: string;
};

const PHOTO_STEPS: PhotoStep[] = [
  { key: "overall", instruction: "コーナー全体が分かる写真を撮影してください" },
  { key: "mid", instruction: "カビの発生個所の写真を少し引きで撮影してください" },
  { key: "close", instruction: "カビの発生個所の写真を寄りで撮影してください" },
];

// ── データ型 ─────────────────────────────────────────────────────

type PhotoData = { step: string; file: File; url: string };

type LocationData = {
  id: string;
  name: string;
  photos: PhotoData[];
};

type Phase =
  | "start"
  | "input-location"
  | "shooting"
  | "next-or-done"
  | "complete";

// ── ストレージキー ──────────────────────────────────────────────

const STORAGE_KEY = "investigation-data-v1";

function saveToStorage(locations: LocationData[]) {
  try {
    // File オブジェクトは保存できないので、写真は URL のみ保持
    const serializable = locations.map((loc) => ({
      ...loc,
      photos: loc.photos.map((p) => ({ step: p.step, url: p.url })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    /* ignore */
  }
}

// ── メインコンポーネント ─────────────────────────────────────────

export default function InvestigationPage() {
  const [phase, setPhase] = useState<Phase>("start");
  const [locationName, setLocationName] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [currentPhotos, setCurrentPhotos] = useState<PhotoData[]>([]);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // ── 場所を開始 ────────────────────────────────────────────────

  function startNewLocation() {
    setLocationName("");
    setCurrentStepIndex(0);
    setCurrentPhotos([]);
    setPhase("input-location");
  }

  function confirmLocation() {
    if (!locationName.trim()) return;
    setCurrentStepIndex(0);
    setCurrentPhotos([]);
    setPhase("shooting");
  }

  // ── 撮影処理 ──────────────────────────────────────────────────

  function handlePhoto(files: File[]) {
    if (files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    const step = PHOTO_STEPS[currentStepIndex].key;
    const nextPhotos = [...currentPhotos, { step, file, url }];
    setCurrentPhotos(nextPhotos);

    if (currentStepIndex < PHOTO_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      setPhase("next-or-done");
    }
  }

  // ── 場所を確定してリストに追加 ────────────────────────────────

  function finishCurrentLocation() {
    const loc: LocationData = {
      id: randomUUID(),
      name: locationName.trim(),
      photos: [...currentPhotos],
    };
    const next = [...locations, loc];
    setLocations(next);
    saveToStorage(next);
    return next;
  }

  function goToNextLocation() {
    finishCurrentLocation();
    startNewLocation();
  }

  function completeAll() {
    finishCurrentLocation();
    setPhase("complete");
  }

  // ── 全体リセット ──────────────────────────────────────────────

  function resetAll() {
    for (const loc of locations) {
      for (const p of loc.photos) {
        URL.revokeObjectURL(p.url);
      }
    }
    for (const p of currentPhotos) {
      URL.revokeObjectURL(p.url);
    }
    setLocations([]);
    setCurrentPhotos([]);
    setLocationName("");
    setCurrentStepIndex(0);
    localStorage.removeItem(STORAGE_KEY);
    setPhase("start");
  }

  // ── 描画 ──────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* ─── スタート画面 ─── */}
      {phase === "start" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-wide">現場調査</h1>
            <p className="mt-2 text-sm text-zinc-400">
              ガイドに従って撮影を進めてください
            </p>
          </div>
          <button
            type="button"
            onClick={startNewLocation}
            className="h-16 w-full max-w-xs rounded-2xl bg-white text-lg font-bold text-zinc-900 active:bg-zinc-200"
          >
            現調スタート
          </button>
          <a
            href="/"
            className="text-sm text-zinc-500 underline hover:text-zinc-300"
          >
            トップへ戻る
          </a>
        </div>
      )}

      {/* ─── 調査箇所入力 ─── */}
      {phase === "input-location" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="text-center">
            <p className="text-sm text-zinc-400">
              {locations.length > 0
                ? `${locations.length}箇所 撮影済み`
                : "最初の調査箇所"}
            </p>
            <h2 className="mt-1 text-2xl font-bold">調査箇所を入力</h2>
          </div>
          <input
            type="text"
            autoFocus
            placeholder="例）精肉コーナー"
            className="h-14 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-center text-lg text-white outline-none focus:border-zinc-500"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmLocation();
            }}
          />
          <button
            type="button"
            disabled={!locationName.trim()}
            onClick={confirmLocation}
            className="h-14 w-full max-w-sm rounded-2xl bg-white text-lg font-bold text-zinc-900 disabled:opacity-30 active:bg-zinc-200"
          >
            撮影を開始する
          </button>
          {locations.length > 0 && (
            <button
              type="button"
              onClick={() => setPhase("complete")}
              className="text-sm text-zinc-500 underline hover:text-zinc-300"
            >
              撮影を終了して確認する
            </button>
          )}
        </div>
      )}

      {/* ─── 撮影画面 ─── */}
      {phase === "shooting" && (
        <div className="flex flex-1 flex-col">
          {/* ヘッダー情報 */}
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                📍 {locationName}
              </span>
              <span className="text-xs text-zinc-500">
                {currentStepIndex + 1} / {PHOTO_STEPS.length}
              </span>
            </div>
            {/* プログレスバー */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{
                  width: `${((currentStepIndex) / PHOTO_STEPS.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* 撮影済みプレビュー */}
          {currentPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-900/50 p-3">
              {currentPhotos.map((p, i) => (
                <div key={p.url} className="shrink-0">
                  <p className="mb-1 text-center text-[10px] text-zinc-500">
                    {PHOTO_STEPS[i]?.key === "overall"
                      ? "全体"
                      : PHOTO_STEPS[i]?.key === "mid"
                        ? "引き"
                        : "寄り"}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    className="h-16 w-20 rounded-lg border border-zinc-700 object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* 指示テキスト */}
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-4xl">
                📷
              </div>
              <h2 className="text-xl font-bold leading-relaxed">
                {PHOTO_STEPS[currentStepIndex].instruction}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                ステップ {currentStepIndex + 1} / {PHOTO_STEPS.length}
              </p>
            </div>

            {/* 撮影ボタン */}
            <label className="flex h-16 w-full max-w-sm cursor-pointer items-center justify-center rounded-2xl bg-white text-lg font-bold text-zinc-900 active:bg-zinc-200">
              📷 撮影する
              <input
                key={`photo-${currentStepIndex}-${currentPhotos.length}`}
                type="file"
                accept="image/*"
                {...(isIOS ? { capture: "environment" } : {})}
                ref={(el) => {
                  if (el && isIOS) el.setAttribute("capture", "environment");
                }}
                className="hidden"
                onChange={(e) => {
                  handlePhoto(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>

            {/* ライブラリから選択（PCやAndroid） */}
            {!isIOS && (
              <label className="flex h-12 w-full max-w-sm cursor-pointer items-center justify-center rounded-xl border border-zinc-700 text-sm font-medium text-zinc-400 hover:bg-zinc-900">
                🖼 ライブラリから選択
                <input
                  key={`lib-${currentStepIndex}-${currentPhotos.length}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handlePhoto(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {/* ─── 次へ or 完了 選択画面 ─── */}
      {phase === "next-or-done" && (
        <div className="flex flex-1 flex-col">
          {/* ヘッダー */}
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <span className="text-sm font-medium text-zinc-300">
              📍 {locationName} — 撮影完了
            </span>
          </div>

          {/* 撮影した写真一覧 */}
          <div className="border-b border-zinc-800 p-4">
            <p className="mb-2 text-center text-sm font-medium text-zinc-400">
              {locationName}の撮影結果（{currentPhotos.length}枚）
            </p>
            <div className="flex justify-center gap-3">
              {currentPhotos.map((p, i) => (
                <div key={p.url} className="text-center">
                  <p className="mb-1 text-xs text-zinc-500">
                    {PHOTO_STEPS[i]?.key === "overall"
                      ? "全体"
                      : PHOTO_STEPS[i]?.key === "mid"
                        ? "引き"
                        : "寄り"}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    className="h-24 w-32 rounded-lg border border-zinc-700 object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 選択肢 */}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
            <h2 className="text-xl font-bold">
              次の撮影箇所へ移動してください
            </h2>
            <p className="text-sm text-zinc-400">
              これまでに {locations.length + 1}箇所 撮影済み
            </p>

            <button
              type="button"
              onClick={goToNextLocation}
              className="h-16 w-full max-w-sm rounded-2xl bg-white text-lg font-bold text-zinc-900 active:bg-zinc-200"
            >
              次の箇所を撮影する
            </button>

            <button
              type="button"
              onClick={completeAll}
              className="h-14 w-full max-w-sm rounded-2xl border-2 border-zinc-600 text-base font-bold text-zinc-300 active:bg-zinc-800"
            >
              撮影を完了する
            </button>
          </div>
        </div>
      )}

      {/* ─── 完了画面 ─── */}
      {phase === "complete" && (
        <div className="flex flex-1 flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <h2 className="text-lg font-bold">撮影完了</h2>
            <span className="text-sm text-zinc-400">
              {locations.length}箇所
            </span>
          </div>

          {/* 結果一覧 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto flex max-w-lg flex-col gap-4">
              {locations.map((loc, locIdx) => (
                <div
                  key={loc.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <p className="mb-2 text-sm font-semibold text-zinc-200">
                    {locIdx + 1}. {loc.name}
                  </p>
                  <div className="flex gap-2 overflow-x-auto">
                    {loc.photos.map((p, i) => (
                      <div key={p.url} className="shrink-0 text-center">
                        <p className="mb-1 text-[10px] text-zinc-500">
                          {PHOTO_STEPS[i]?.key === "overall"
                            ? "全体"
                            : PHOTO_STEPS[i]?.key === "mid"
                              ? "引き"
                              : "寄り"}
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt=""
                          className="h-20 w-28 rounded-lg border border-zinc-700 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 操作ボタン */}
          <div className="flex flex-col gap-3 border-t border-zinc-800 bg-zinc-900 p-4">
            <p className="text-center text-xs text-zinc-500">
              ※ 免責箇所の撮影は次のアップデートで対応予定です
            </p>
            <button
              type="button"
              onClick={startNewLocation}
              className="h-12 w-full rounded-xl border border-zinc-600 text-sm font-semibold text-zinc-300 active:bg-zinc-800"
            >
              箇所を追加する
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="h-10 w-full rounded-xl text-sm text-zinc-500 hover:text-zinc-300"
            >
              最初からやり直す
            </button>
            <a
              href="/"
              className="block h-10 rounded-xl text-center leading-10 text-sm text-zinc-500 underline hover:text-zinc-300"
            >
              トップへ戻る
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
