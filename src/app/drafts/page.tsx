import Link from "next/link";
import DraftsList from "./DraftsList";

export default function DraftsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">下書き一覧</h1>
            <p className="text-sm text-zinc-600">
              登録した施工場所・免責・写真を確認できます。
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              ← トップへ
            </Link>
            <Link
              href="/entry"
              className="inline-flex h-11 items-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              新規作成
            </Link>
          </div>
        </header>

        <DraftsList />
      </div>
    </div>
  );
}
