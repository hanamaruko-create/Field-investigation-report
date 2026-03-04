import Link from "next/link";
import { CONTRACTOR_NAME, PROJECT_NAME } from "@/lib/constants";

export default function Home() {
  // サンプルの表紙スタイル。PDFの1ページ目を再現するため、
  // 中央揃えの大きなタイトルとプロジェクト情報を表示する。
  const today = new Date().toLocaleDateString("ja-JP");

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      {/* 大タイトル */}
      <h1 className="text-6xl font-bold tracking-wide mb-12">
        現地調査報告書
      </h1>

      {/* プロジェクト情報 */}
      <div className="w-full max-w-xl text-center text-lg leading-relaxed text-zinc-800">
        <p className="mb-4">工事名称：{PROJECT_NAME}</p>
        <p className="mb-4">請負者：{CONTRACTOR_NAME}</p>
        <p className="mb-4">調査日：{today}</p>
      </div>

      {/* ナビゲーション */}
      <div className="mt-12 flex gap-4">
        <Link
          href="/entry"
          className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700"
        >
          報告書を入力する
        </Link>
        <Link
          href="/drafts"
          className="rounded-xl border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          下書き一覧
        </Link>
      </div>

      {/* フッターとして会社名や住所を入れるスペース */}
      <footer className="mt-auto py-8 text-sm text-zinc-500">
        © {new Date().getFullYear()} {CONTRACTOR_NAME} 〜本書は現地調査の結果をまとめたものです〜
      </footer>
    </div>
  );
}
