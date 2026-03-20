"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onCommit: (files: File[]) => void;
  onCancel: () => void;
};

export default function ContinuousCamera({ onCommit, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [useFileInput, setUseFileInput] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setUseFileInput(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch {
      setUseFileInput(true);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setStaged((prev) => [...prev, { file, url }]);
      },
      "image/jpeg",
      0.9
    );
  }, []);

  function addFiles(files: File[]) {
    setStaged((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    ]);
  }

  function commit() {
    stopCamera();
    onCommit(staged.map((s) => s.file));
    staged.forEach((s) => URL.revokeObjectURL(s.url));
  }

  function cancel() {
    stopCamera();
    staged.forEach((s) => URL.revokeObjectURL(s.url));
    onCancel();
  }

  // フォールバック: getUserMedia 非対応環境（iOS をHTTPでアクセスした場合など）
  if (useFileInput) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
        <div className="flex-1 overflow-y-auto p-4">
          {staged.length > 0 ? (
            <>
              <p className="mb-3 text-center text-sm font-medium text-zinc-300">
                {staged.length}枚{isIOS ? "撮影済み" : "選択済み"}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {staged.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={s.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500">
                {isIOS ? "撮影した写真がここに表示されます" : "選択した写真がここに表示されます"}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-zinc-800 bg-zinc-900 p-4">
          <label className="flex h-14 cursor-pointer items-center justify-center rounded-xl bg-white text-base font-semibold text-zinc-900 active:bg-zinc-100">
            📷 {staged.length > 0 ? (isIOS ? "もう1枚撮影" : "もう1枚追加") : (isIOS ? "撮影する" : "写真を選択")}
            <input
              key={staged.length}
              type="file"
              accept="image/*"
              {...(isIOS ? { capture: "environment" } : { multiple: true })}
              className="hidden"
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

  // メイン: ブラウザ内カメラ（連続撮影モード）
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* カメラプレビュー */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {/* 撮影済みサムネイル */}
        {staged.length > 0 && (
          <div className="absolute bottom-3 left-0 right-0 flex gap-2 overflow-x-auto px-4">
            {staged.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={s.url}
                alt=""
                className="h-16 w-16 flex-shrink-0 rounded-lg object-cover ring-2 ring-white shadow-lg"
              />
            ))}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* 操作ボタン */}
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-8 py-5">
        <button
          type="button"
          onClick={cancel}
          className="text-sm text-zinc-400 active:text-zinc-200"
        >
          キャンセル
        </button>

        {/* シャッターボタン */}
        <button
          type="button"
          onClick={capture}
          disabled={!cameraReady}
          className="h-16 w-16 rounded-full border-4 border-white bg-white shadow-xl active:scale-90 disabled:opacity-40 transition-transform"
          aria-label="撮影"
        />

        {staged.length > 0 ? (
          <button
            type="button"
            onClick={commit}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white active:bg-green-700"
          >
            完了 ({staged.length})
          </button>
        ) : (
          <div className="w-16" />
        )}
      </div>
    </div>
  );
}
