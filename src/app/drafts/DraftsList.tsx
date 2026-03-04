"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Draft } from "@/lib/storage";

async function fetchDrafts(): Promise<Draft[]> {
  const r = await fetch("/api/drafts", { cache: "no-store" });
  const data = (await r.json()) as { drafts?: Draft[] };
  return data.drafts ?? [];
}

export default function DraftsList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchDrafts()
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `削除失敗 (HTTP ${res.status})`);
      }
      // サーバーから最新リストを再取得して確定
      const fresh = await fetchDrafts();
      setDrafts(fresh);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">読み込み中…</div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600">
        まだ下書きがありません。{" "}
        <Link className="underline" href="/entry">
          /entry
        </Link>
        から登録してください。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {deleteError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          削除エラー: {deleteError}
        </div>
      ) : null}
      {drafts.map((d) => (
        <section
          key={d.id}
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex flex-col gap-1">
            <div className="text-sm font-semibold">
              {d.projectName} / 調査日：{d.surveyDate}
            </div>
            <div className="text-xs text-zinc-500">
              請負者：{d.contractorName} / 登録：
              {new Date(d.createdAt).toLocaleString()}
            </div>
            <div className="text-xs text-zinc-500">
              撮影場所：{d.items.length}件 / 写真：
              {d.items.reduce((sum, it) => sum + it.photos.length, 0)}枚
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                href={`/report/${d.id}`}
                className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800"
              >
                報告書を編集・PDF出力
              </Link>

              {confirmingId === d.id ? (
                <>
                  <span className="text-xs text-zinc-600">削除しますか？</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    disabled={deletingId === d.id}
                    className="inline-flex h-9 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingId === d.id ? "削除中…" : "削除"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(d.id)}
                  className="inline-flex h-9 items-center rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {d.items.map((it) => (
              <div
                key={it.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="mb-2 flex flex-col gap-1">
                  <div className="text-sm font-semibold text-zinc-900">
                    撮影場所：{it.place}
                  </div>
                  <div className="text-xs text-zinc-600">
                    写真：{it.photos.length}枚
                    {it.code ? `　免責コード：${it.code}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(it.photos.length, 3)}, 1fr)`,
                    gap: "4px",
                  }}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-1"
                >
                  {it.photos.map((photo) => (
                    <Image
                      key={photo.filename}
                      src={`/api/uploads/${photo.filename}`}
                      alt={`${it.place} の写真`}
                      width={400}
                      height={300}
                      className="aspect-[4/3] w-full rounded object-cover"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
