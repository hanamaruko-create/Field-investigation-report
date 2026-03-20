"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
    const serializable = locations.map((loc) => ({
      ...loc,
      photos: loc.photos.map((p) => ({ step: p.step, url: p.url })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    /* ignore */
  }
}

function stepLabel(key: string) {
  if (key === "overall") return "全体";
  if (key === "mid") return "引き";
  return "寄り";
}

// ── メインコンポーネント ─────────────────────────────────────────

export default function InvestigationPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("start");
  const [locationName, setLocationName] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [currentPhotos, setCurrentPhotos] = useState<PhotoData[]>([]);
  const [isIOS, setIsIOS] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const libInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // 現在のステップで撮影した写真
  const currentStepKey = PHOTO_STEPS[currentStepIndex]?.key ?? "";
  const currentStepPhotos = currentPhotos.filter((p) => p.step === currentStepKey);

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

  // ── 撮影処理（複数枚対応） ────────────────────────────────────

  function handlePhoto(files: File[]) {
    if (files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    const step = PHOTO_STEPS[currentStepIndex].key;
    setCurrentPhotos((prev) => [...prev, { step, file, url }]);
  }

  // 現在のステップの写真を削除
  function removeStepPhoto(url: string) {
    setCurrentPhotos((prev) => {
      URL.revokeObjectURL(url);
      return prev.filter((p) => p.url !== url);
    });
  }

  // ── ステップを進める ──────────────────────────────────────────

  function advanceStep() {
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
      for (const p of loc.photos) URL.revokeObjectURL(p.url);
    }
    for (const p of currentPhotos) URL.revokeObjectURL(p.url);
    setLocations([]);
    setCurrentPhotos([]);
    setLocationName("");
    setCurrentStepIndex(0);
    localStorage.removeItem(STORAGE_KEY);
    setPhase("start");
  }

  // ── 描画 ──────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">

      {/* ─── スタート画面 ─── */}
      {phase === "start" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-wide">現場調査</h1>
            <p className="mt-2 text-sm text-zinc-500">
              ガイドに従って撮影を進めてください
            </p>
          </div>
          <button
            type="button"
            onClick={startNewLocation}
            className="h-16 w-full max-w-xs rounded-2xl bg-zinc-900 text-lg font-bold text-white active:bg-zinc-700"
          >
            現調スタート
          </button>
          <a
            href="/"
            className="text-sm text-zinc-400 underline hover:text-zinc-600"
          >
            トップへ戻る
          </a>
        </div>
      )}

      {/* ─── 調査箇所入力 ─── */}
      {phase === "input-location" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="text-center">
            <p className="text-sm text-zinc-500">
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
            className="h-14 w-full max-w-sm rounded-xl border border-zinc-300 bg-white px-4 text-center text-lg text-zinc-900 outline-none focus:border-zinc-500"
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
            className="h-14 w-full max-w-sm rounded-2xl bg-zinc-900 text-lg font-bold text-white disabled:opacity-30 active:bg-zinc-700"
          >
            撮影を開始する
          </button>
          {locations.length > 0 && (
            <button
              type="button"
              onClick={() => setPhase("complete")}
              className="text-sm text-zinc-400 underline hover:text-zinc-600"
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
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">
                📍 {locationName}
              </span>
              <span className="text-xs text-zinc-400">
                {currentStepIndex + 1} / {PHOTO_STEPS.length}
              </span>
            </div>
            {/* プログレスバー */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all duration-300"
                style={{
                  width: `${(currentStepIndex / PHOTO_STEPS.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* 撮影済みプレビュー（全ステップ） */}
          {currentPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 bg-zinc-50 p-3">
              {PHOTO_STEPS.map((step, si) => {
                const stepPhotos = currentPhotos.filter((p) => p.step === step.key);
                if (stepPhotos.length === 0) return null;
                return stepPhotos.map((p) => (
                  <div key={p.url} className="shrink-0">
                    <p className="mb-1 text-center text-[10px] text-zinc-500">
                      {stepLabel(step.key)}
                      {si === currentStepIndex && (
                        <span className="ml-1 text-zinc-400">●</span>
                      )}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt=""
                      className="h-16 w-20 rounded-lg border border-zinc-200 object-cover"
                    />
                  </div>
                ));
              })}
            </div>
          )}

          {/* 指示テキスト + 撮影ボタン */}
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 text-4xl">
                📷
              </div>
              <h2 className="text-xl font-bold leading-relaxed">
                {PHOTO_STEPS[currentStepIndex].instruction}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                ステップ {currentStepIndex + 1} / {PHOTO_STEPS.length}
                {currentStepPhotos.length > 0 && (
                  <span className="ml-2 font-medium text-zinc-700">
                    （{currentStepPhotos.length}枚撮影済み）
                  </span>
                )}
              </p>
            </div>

            {/* このステップの撮影済み写真 */}
            {currentStepPhotos.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {currentStepPhotos.map((p) => (
                  <div key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt=""
                      className="h-20 w-28 rounded-lg border border-zinc-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeStepPhoto(p.url)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 撮影ボタン */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              {...(isIOS ? { capture: "environment" } : {})}
              className="hidden"
              onChange={(e) => {
                handlePhoto(Array.from(e.target.files ?? []));
                if (photoInputRef.current) photoInputRef.current.value = "";
              }}
            />
            <button
              type="button"
              className="flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-zinc-900 text-base font-bold text-white active:bg-zinc-700"
              onClick={() => photoInputRef.current?.click()}
            >
              📷 撮影する
            </button>

            {/* ライブラリから選択 */}
            {!isIOS && (
              <>
                <input
                  ref={libInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handlePhoto(Array.from(e.target.files ?? []));
                    if (libInputRef.current) libInputRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  className="flex h-12 w-full max-w-sm items-center justify-center rounded-xl border border-zinc-300 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  onClick={() => libInputRef.current?.click()}
                >
                  🖼 ライブラリから選択
                </button>
              </>
            )}

            {/* 撮影完了ボタン（1枚以上撮ったら出現） */}
            {currentStepPhotos.length > 0 && (
              <button
                type="button"
                onClick={advanceStep}
                className="h-12 w-full max-w-sm rounded-2xl border-2 border-zinc-900 text-base font-bold text-zinc-900 active:bg-zinc-100"
              >
                {currentStepPhotos.length}枚で撮影完了 →{" "}
                {currentStepIndex < PHOTO_STEPS.length - 1
                  ? stepLabel(PHOTO_STEPS[currentStepIndex + 1].key) + "の撮影へ"
                  : "この箇所を完了"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── 次へ or 完了 選択画面 ─── */}
      {phase === "next-or-done" && (
        <div className="flex flex-1 flex-col">
          {/* ヘッダー */}
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <span className="text-sm font-medium text-zinc-700">
              📍 {locationName} — 撮影完了
            </span>
          </div>

          {/* 撮影した写真一覧 */}
          <div className="border-b border-zinc-200 p-4">
            <p className="mb-3 text-center text-sm font-medium text-zinc-600">
              {locationName}の撮影結果（{currentPhotos.length}枚）
            </p>
            {PHOTO_STEPS.map((step) => {
              const stepPhotos = currentPhotos.filter((p) => p.step === step.key);
              if (stepPhotos.length === 0) return null;
              return (
                <div key={step.key} className="mb-3">
                  <p className="mb-1 text-xs font-medium text-zinc-500">
                    {stepLabel(step.key)}（{stepPhotos.length}枚）
                  </p>
                  <div className="flex gap-2 overflow-x-auto">
                    {stepPhotos.map((p) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={p.url}
                        src={p.url}
                        alt=""
                        className="h-20 w-28 shrink-0 rounded-lg border border-zinc-200 object-cover"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 選択肢 */}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
            <h2 className="text-xl font-bold">
              次の撮影箇所へ移動してください
            </h2>
            <p className="text-sm text-zinc-500">
              これまでに {locations.length + 1}箇所 撮影済み
            </p>

            <button
              type="button"
              onClick={goToNextLocation}
              className="h-16 w-full max-w-sm rounded-2xl bg-zinc-900 text-lg font-bold text-white active:bg-zinc-700"
            >
              次の箇所を撮影する
            </button>

            <button
              type="button"
              onClick={completeAll}
              className="h-14 w-full max-w-sm rounded-2xl border-2 border-zinc-400 text-base font-bold text-zinc-600 active:bg-zinc-100"
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
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h2 className="text-lg font-bold">撮影完了</h2>
            <span className="text-sm text-zinc-500">
              {locations.length}箇所
            </span>
          </div>

          {/* 結果一覧 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto flex max-w-lg flex-col gap-4">
              {locations.map((loc, locIdx) => (
                <div
                  key={loc.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="mb-2 text-sm font-semibold text-zinc-800">
                    {locIdx + 1}. {loc.name}（{loc.photos.length}枚）
                  </p>
                  {PHOTO_STEPS.map((step) => {
                    const stepPhotos = loc.photos.filter((p) => p.step === step.key);
                    if (stepPhotos.length === 0) return null;
                    return (
                      <div key={step.key} className="mb-2">
                        <p className="mb-1 text-[10px] text-zinc-400">
                          {stepLabel(step.key)}（{stepPhotos.length}枚）
                        </p>
                        <div className="flex gap-2 overflow-x-auto">
                          {stepPhotos.map((p) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              key={p.url}
                              src={p.url}
                              alt=""
                              className="h-16 w-22 shrink-0 rounded-lg border border-zinc-200 object-cover"
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 操作ボタン */}
          <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 p-4">
            <button
              type="button"
              onClick={() => router.push("/entry")}
              className="h-14 w-full rounded-2xl bg-zinc-900 text-base font-bold text-white active:bg-zinc-700"
            >
              保存して報告書入力へ進む →
            </button>
            <button
              type="button"
              onClick={startNewLocation}
              className="h-12 w-full rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700 active:bg-zinc-100"
            >
              箇所を追加する
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="h-10 w-full rounded-xl text-sm text-zinc-400 hover:text-zinc-600"
            >
              最初からやり直す
            </button>
            <a
              href="/"
              className="block h-10 rounded-xl text-center leading-10 text-sm text-zinc-400 underline hover:text-zinc-600"
            >
              トップへ戻る
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
