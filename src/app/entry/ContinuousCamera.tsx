"use client";

import { useState } from "react";

type Props = {
  onCommit: (files: File[]) => void;
  onCancel: () => void;
};

export default function ContinuousCamera({ onCommit, onCancel }: Props) {
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([]);

  function addFiles(files: File[]) {
    setStaged((prev) => [...prev, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
  }

  function commit() {
    onCommit(staged.map((s) => s.file));
    staged.forEach((s) => URL.revokeObjectURL(s.url));
  }

  function cancel() {
    staged.forEach((s) => URL.revokeObjectURL(s.url));
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* 撮影済み写真プレビュー */}
      <div className="flex-1 overflow-y-auto p-4">
        {staged.length > 0 ? (
          <>
            <p className="mb-3 text-center text-sm font-medium text-zinc-300">
              {staged.length}枚撮影済み
            </p>
            <div className="grid grid-cols-3 gap-2">
              {staged.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={s.url}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">撮影した写真がここに表示されます</p>
          </div>
        )}
      </div>

      {/* 操作ボタン */}
      <div className="flex flex-col gap-3 border-t border-zinc-800 bg-zinc-900 p-4">
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-xl bg-white text-base font-semibold text-zinc-900 active:bg-zinc-100">
          📷 {staged.length > 0 ? "もう1枚撮影" : "撮影する"}
          <input
            key={staged.length}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={(el) => { if (el) el.setAttribute("capture", "environment"); }}
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); }}
          />
        </label>
        {staged.length > 0 && (
          <button
            type="button"
            onClick={commit}
            className="h-12 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 active:bg-green-800"
          >
            ✓ {staged.length}枚を追加して完了
          </button>
        )}
        <button
          type="button"
          onClick={cancel}
          className="h-10 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
