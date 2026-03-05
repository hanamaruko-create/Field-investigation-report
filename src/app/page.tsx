import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-white px-8">
      <h1 className="text-3xl font-bold tracking-wide text-zinc-900">
        現調報告書作成アプリ
      </h1>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/entry"
          className="flex items-center justify-center rounded-xl bg-zinc-900 px-6 py-4 text-sm font-medium text-white hover:bg-zinc-700"
        >
          報告書を入力する
        </Link>
        <Link
          href="/drafts"
          className="flex items-center justify-center rounded-xl border border-zinc-300 px-6 py-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          下書き一覧
        </Link>
      </div>
    </div>
  );
}
