# 現地調査報告書アプリ 学習ガイド（NotebookLM 読み込み用）

このドキュメントは、AI が書いた「現地調査報告書アプリ」のコードを自分で理解するための学習ガイドです。
「このコードがどんな仕組みで動いているか」をひとつひとつ説明します。

---

## 第1章：このアプリが何をするものか

### アプリの目的

このアプリは、建設・施工会社（株式会社 IPEC）が現地調査に行ったときの報告書をブラウザで作れるツールです。

スマホやパソコンで使って、

1. 調査した場所の写真を撮影・選択する
2. 場所の名前や免責事項のコードを入力する
3. 必要であれば図面（フロアプラン）を追加する
4. 保存して、あとで報告書として PDF に印刷する

という流れで動きます。

### 画面の構成（ページ一覧）

| URL パス | 画面の名前 | 役割 |
|---|---|---|
| `/` | トップ（表紙） | タイトルと日付を表示。ナビゲーション |
| `/entry` | 入力フォーム | 下書きを新規作成する |
| `/drafts` | 下書き一覧 | 保存した下書きの一覧 |
| `/report/[id]` | 報告書プレビュー | 下書きを報告書として表示・編集・PDF 出力 |
| `/floor-plan` | 図面編集（単体） | 図面にアノテーションをつける |

---

## 第2章：使っている技術（スタック）

### Next.js とは何か

Next.js は React をベースにした Web フレームワークです。

「フレームワーク」とは、よく使う機能をあらかじめまとめたツールセットのことです。
Next.js を使うと、以下のことが簡単にできます。

- **ページのルーティング（URL の管理）**：`src/app/entry/page.tsx` というファイルを置くだけで `/entry` というページが作れる
- **API の作成**：`src/app/api/drafts/route.ts` を置くだけで `/api/drafts` というサーバー側の処理が作れる
- **フロントとバックをひとつのプロジェクトで管理**できる

### React とは何か

React は画面（UI）を作るための JavaScript ライブラリです。

ポイントは「**コンポーネント**」という考え方です。
画面をボタン、フォーム、カードなど小さなパーツに分けて、それを組み合わせて作ります。

```
例：EntryPage（入力フォームページ）
  ├── ヘッダー（工事名・日付の入力欄）
  ├── セット1（撮影場所 + 写真 + 免責コード）
  ├── セット2（撮影場所 + 写真 + 免責コード）
  └── 図面セクション
```

### TypeScript とは何か

TypeScript は JavaScript に「型」を追加した言語です。

型とは「この変数には文字列しか入れてはいけない」「この関数は数値を返す」というルールのことです。

```typescript
// 例：Draft という型の定義（src/lib/storage.ts より）
type Draft = {
  id: string;           // ID は文字列
  projectName: string;  // 工事名は文字列
  surveyDate: string;   // 調査日は文字列（yyyy-mm-dd 形式）
  items: DraftItem[];   // 撮影場所の一覧は DraftItem の配列
};
```

TypeScript のメリット：コードを書くときにミスが起きにくくなる。

### Tailwind CSS とは何か

Tailwind CSS は画面のデザイン（見た目）を作るためのツールです。

普通の CSS は別ファイルに書きますが、Tailwind は HTML/JSX の中に直接クラス名として書きます。

```jsx
// 例：黒い背景・白い文字・角丸のボタン
<button className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white">
  保存して一覧へ
</button>
```

`rounded-xl`（角丸）、`bg-zinc-900`（黒に近いグレーの背景）、`text-white`（白文字）などがそれぞれスタイルを意味します。

---

## 第3章：フロントエンドの仕組み

### コンポーネントと状態（State）

React コンポーネントは「**state（状態）**」という仕組みで画面の変化を管理します。

```typescript
// src/app/entry/page.tsx より

const [projectName, setProjectName] = useState("");
// 「projectName」という状態変数を作る。初期値は空文字。
// setProjectName を呼ぶと値が変わり、画面が再描画される。

const [items, setItems] = useState<EntryItem[]>([newItem()]);
// 「items」は撮影場所セットの配列。最初は1件だけ入っている。
```

`useState` は React のフックと呼ばれる機能のひとつです。
フックは `use〇〇` という名前で始まる特別な関数です。

### よく使われる React フック

| フック名 | 役割 | このアプリでの使用例 |
|---|---|---|
| `useState` | 変化する値を保持する | 入力フォームの内容、写真のリストなど |
| `useEffect` | 特定のタイミングで処理を実行 | テキストエリアの高さを自動調整する |
| `useRef` | DOM 要素への参照を保持 | 印刷対象のエリアを指定する |
| `useMemo` | 計算結果をキャッシュ | 免責コード一覧を一度だけ計算する |
| `useRouter` | ページ遷移を行う | 保存後に `/drafts` に移動する |

### "use client" とは何か

Next.js では、コンポーネントに `"use client"` と書くと「ブラウザ側で動くコンポーネント」になります。

```typescript
"use client";  // ← この1行でクライアント（ブラウザ）で動くようになる

import { useState } from "react";
```

書いていない場合はサーバー側で動くコンポーネント（Server Component）になります。

| 種類 | 動く場所 | useState が使えるか |
|---|---|---|
| Server Component | サーバー | 使えない |
| Client Component | ブラウザ | 使える |

このアプリでは、入力フォームやレポートエディタは `"use client"` で始まっています。
トップページやレイアウトはサーバーコンポーネントです。

### ページ遷移の仕組み（App Router）

Next.js 13 以降の「App Router」では、フォルダ構造がそのまま URL になります。

```
src/app/
  page.tsx           → /          （トップページ）
  entry/
    page.tsx         → /entry     （入力フォーム）
  drafts/
    page.tsx         → /drafts    （下書き一覧）
  report/
    [id]/
      page.tsx       → /report/123（個別報告書。123 は下書きID）
  api/
    drafts/
      route.ts       → /api/drafts（API）
      [id]/
        route.ts     → /api/drafts/123（個別API）
```

`[id]` のように角括弧で囲んだフォルダは「動的ルート」といい、どんな ID にもマッチします。

### フォームとファイルアップロードの仕組み

写真のアップロードは `FormData` という仕組みを使っています。

```typescript
// src/app/entry/page.tsx より（簡略化）

const formData = new FormData();
formData.set("projectName", projectName);      // テキスト情報をセット
formData.set("surveyDate", surveyDate);
formData.set("items", JSON.stringify(payloadItems));  // 配列は JSON 文字列に変換

for (const file of allFiles) {
  formData.append("photos", file, file.name);  // ファイルを追加
}

// サーバーの API に送信
const res = await fetch("/api/drafts", {
  method: "POST",
  body: formData,
});
```

`fetch` はブラウザからサーバーにリクエストを送る標準の関数です。

### 写真プレビューの仕組み

ユーザーが写真を選んだとき、すぐにプレビューが表示されます。
これは `URL.createObjectURL` という API を使っています。

```typescript
// files は File オブジェクトの配列
const previewUrls = files.map((f) => URL.createObjectURL(f));
// → "blob:http://localhost:3000/xxxx-xxxx" のような一時的な URL が作られる
// → この URL を <img src={url}> に渡すと画像が表示される
```

使い終わったら `URL.revokeObjectURL(url)` でメモリを解放します。

---

## 第4章：バックエンド（API）の仕組み

### API Route とは何か

Next.js では `route.ts` というファイルを作ると、そのファイルがサーバー側の API になります。

ブラウザからのリクエストを受け取り、データを処理して JSON で返します。

```typescript
// src/app/api/drafts/route.ts より

// GET リクエストへの処理（下書き一覧を返す）
export async function GET() {
  const drafts = await listDrafts();  // JSON ファイルから読み込む
  return NextResponse.json({ drafts });  // JSON で返す
}

// POST リクエストへの処理（新しい下書きを保存する）
export async function POST(req: Request) {
  const formData = await req.formData();  // フォームデータを受け取る
  // ... データを検証して保存する処理 ...
  return NextResponse.json({ draft }, { status: 201 });
}
```

| HTTP メソッド | 意味 | このアプリでの使い方 |
|---|---|---|
| GET | データを取得 | 下書き一覧の取得 |
| POST | 新しいデータを作成 | 下書きの新規作成 |
| PATCH | データの一部を更新 | 写真の追加・削除 |
| PUT | データを丸ごと更新 | 下書き全体の更新 |
| DELETE | データを削除 | 下書きの削除 |

### データの保存方法（JSON ファイル）

このアプリにはデータベースがありません。
代わりに、サーバーのファイルシステムに JSON ファイルとして保存しています。

```
data/
  drafts.json          ← 全下書きのデータが入っている JSON ファイル
  uploads/
    abc123.jpg         ← アップロードされた写真ファイル
    def456.jpg
```

`drafts.json` の中身のイメージ：

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "projectName": "〇〇ビル除カビ工事",
    "contractorName": "株式会社IPEC",
    "surveyDate": "2026-03-04",
    "surveyContent": ["除カビ・防カビ施工"],
    "createdAt": "2026-03-04T08:00:00.000Z",
    "items": [
      {
        "id": "xxxx",
        "place": "精肉コーナー",
        "photos": [
          { "filename": "abc123.jpg", "originalName": "photo.jpg", "mimeType": "image/jpeg", "size": 204800 }
        ]
      }
    ],
    "floorPlans": []
  }
]
```

### ファイルの読み書き（Node.js の fs モジュール）

```typescript
// src/lib/storage.ts より

import { promises as fs } from "node:fs";

// JSON ファイルを読み込む
async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");  // ファイルを文字列として読む
    return JSON.parse(raw) as T;                       // JSON パースして返す
  } catch {
    return fallback;  // ファイルがなければデフォルト値を返す
  }
}

// JSON ファイルに書き込む
async function writeJsonFile(filePath: string, value: unknown) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  //                             ↑ JSON 文字列に変換（インデント2スペースで見やすく）
}
```

`async/await` は非同期処理（時間がかかる処理）を待つための構文です。
ファイルの読み書きはディスクへのアクセスが必要なため、非同期になっています。

### UUID（ユニーク ID）の生成

各下書きや撮影場所セットには、重複しない ID が必要です。
`crypto.randomUUID()` を使って生成しています。

```typescript
import crypto from "node:crypto";

const id = crypto.randomUUID();
// → "550e8400-e29b-41d4-a716-446655440000" のような文字列が生成される
```

UUID は世界中で重複する可能性が極めて低い文字列です。

---

## 第5章：図面アノテーション機能の仕組み

### SVG とは何か

図面（フロアプラン）の上に丸や矢印などを描く機能があります。
これは **SVG（Scalable Vector Graphics）** という技術を使っています。

SVG は HTML の中で図形を描くための仕組みです。

```html
<!-- 例：赤い四角形を描く -->
<svg viewBox="0 0 1000 800">
  <rect x="100" y="100" width="200" height="150" fill="none" stroke="red" strokeWidth="3" />
</svg>
```

図面画像の上に SVG を重ねて、アノテーション（注釈）を表示しています。

### アノテーションの種類

```typescript
// src/lib/floorPlanTypes.ts より

type Annotation =
  | { type: "rect";    x, y, w, h, label, color }   // 四角形
  | { type: "ellipse"; cx, cy, rx, ry, label, color } // 楕円
  | { type: "line";    x1, y1, x2, y2, color }       // 直線
  | { type: "arrow";   x1, y1, x2, y2, color }       // 矢印
  | { type: "text";    x, y, text, fontSize, color }  // テキスト
```

各アノテーションは `seq`（順序番号）を持っており、消しゴム（EraserStroke）でアノテーションの一部を消せるようになっています。

---

## 第6章：PDF・印刷の仕組み

### window.print() による PDF 出力

このアプリは PDF 出力のために特別なライブラリを使っていません。
ブラウザの印刷機能（`window.print()`）をそのまま使っています。

```typescript
function handlePrint() {
  window.print();  // ブラウザの印刷ダイアログを開く
}
```

### 印刷用 CSS の制御

印刷時に「画面では見えるけど印刷には出ない部分」と「印刷には出る部分」を CSS で制御しています。

```css
/* 印刷時にナビゲーションボタンを非表示にする */
@media print {
  .no-print { display: none !important; }

  /* 用紙サイズを A4 縦に設定 */
  @page {
    size: A4 portrait;
    margin: 12mm 15mm;
  }
}
```

JSX 側では印刷したくない要素に `className="no-print"` をつけるだけです。

```jsx
<div className="no-print sticky top-0 ...">
  {/* ← これは画面では表示されるが印刷されない */}
  <button onClick={handlePrint}>PDF出力（印刷）</button>
</div>
```

---

## 第7章：データのマイグレーション（古い形式への対応）

アプリが進化すると、データの保存形式が変わることがあります。
このアプリは、昔の形式で保存されたデータを新しい形式に変換する「マイグレーション」の仕組みを持っています。

```typescript
// src/lib/storage.ts より

function migrateDraftItem(raw: Record<string, unknown>): DraftItem {
  if (Array.isArray(raw.photos)) {
    return raw as unknown as DraftItem;  // 新しい形式なのでそのまま返す
  }
  // 旧形式: photos ではなく photo という単体フィールドがあった
  const photos = raw.photo ? [raw.photo as StoredPhoto] : [];
  return { ...rest, photos };  // 新しい形式に変換して返す
}
```

これにより、古いデータでもアプリが壊れずに動き続けます。

---

## 第8章：定数ファイルによる設定管理

会社名・住所・調査内容の選択肢などは `src/lib/constants.ts` にまとめられています。

```typescript
export const CONTRACTOR_NAME = "株式会社IPEC";
export const COMPANY_ADDRESS = "神奈川県藤沢市南藤沢21-9 とのおかビル3F";

export const SURVEY_CONTENT_OPTIONS = [
  "除カビ・防カビ施工",
  "アクシオン塗装",
  "エアコン分解洗浄",
  // ...
];
```

コードのあちこちに直接書かず、ここに集めることで「1箇所変えれば全体に反映される」仕組みになっています。
これを「単一責任の原則」や「DRY 原則（Don't Repeat Yourself）」と呼びます。

---

## 第9章：免責コードと免責文の仕組み

免責コード（A、B、C など）を選ぶと、対応する免責文が自動的に挿入されます。

```typescript
// src/lib/disclaimers.ts が実際のマッピングを持っている

// 使い方（entry/page.tsx より）
const nextCodes = [...prev.codes, code];  // コードを追加
const newText = buildDisclaimerTextFromCodes(nextCodes);  // コードから文章を生成
```

ユーザーが一度でも手動で免責文を編集した場合は、コードを変えても自動上書きされないようになっています。

```typescript
const shouldAuto = !prev.disclaimerTouched || prev.disclaimerText.trim().length === 0;
// disclaimerTouched = true なら手動編集済み → 自動更新しない
```

---

## 第10章：ファイル構成まとめ

```
src/
  app/
    page.tsx                   ← トップページ（表紙）
    layout.tsx                 ← 全ページ共通のレイアウト（フォントなど）
    globals.css                ← グローバル CSS
    entry/
      page.tsx                 ← 入力フォームページ（"use client"）
      FloorPlanModal.tsx       ← 図面アノテーション用モーダル
    drafts/
      page.tsx                 ← 下書き一覧ページ
      DraftsList.tsx           ← 下書き一覧のコンポーネント
    report/
      page.tsx                 ← 報告書一覧
      [id]/
        page.tsx               ← 個別報告書ページ（サーバーでデータを取得）
        ReportEditor.tsx       ← 報告書エディタ（"use client"）
    floor-plan/
      page.tsx                 ← 図面単体ページ
    api/
      drafts/
        route.ts               ← GET（一覧）/ POST（作成）
        [id]/
          route.ts             ← GET（個別）/ PATCH（部分更新）/ PUT（全更新）/ DELETE（削除）
      uploads/
        [filename]/
          route.ts             ← 画像ファイルの配信

  lib/
    constants.ts               ← 定数（会社名・住所・選択肢など）
    storage.ts                 ← データの読み書き（JSON ファイル操作）
    disclaimers.ts             ← 免責コードと免責文のマッピング
    floorPlanTypes.ts          ← 図面アノテーションの型定義
    openCamera.ts              ← カメラ起動のユーティリティ
    uuid.ts                    ← ブラウザ側での UUID 生成

data/
  drafts.json                  ← 保存されている下書きデータ
  uploads/                     ← アップロードされた画像
```

---

## 第11章：NotebookLM でこのガイドを使うときのおすすめ質問

このガイドを NotebookLM に読み込んだあと、以下のような質問をしてみましょう。

- **「useState とは何ですか？このアプリでどう使われていますか？」**
- **「フロントエンドとバックエンドの違いを教えてください」**
- **「/entry ページから保存ボタンを押したとき、データはどこに行きますか？」**
- **「FormData とは何ですか？なぜ使うのですか？」**
- **「このアプリにデータベースはありますか？どこにデータを保存しますか？」**
- **「SVG とは何ですか？図面の機能でどう使われていますか？」**
- **「TypeScript の型とは何ですか？メリットは何ですか？」**
- **「PDF 出力の仕組みを教えてください」**
- **「マイグレーションとは何ですか？なぜ必要ですか？」**
- **「async/await とは何ですか？」**

---

## 用語集

| 用語 | 意味 |
|---|---|
| フロントエンド | ブラウザで動く部分。ユーザーが見て操作する画面 |
| バックエンド | サーバーで動く部分。データの保存・処理を行う |
| API | アプリケーション同士がデータをやり取りするための窓口 |
| コンポーネント | React における画面の部品 |
| State（状態） | コンポーネントが持つ変化する値 |
| フック | React の特殊な関数（useState、useEffect など） |
| 型（Type） | 変数に入れられるデータの種類の制約 |
| JSON | データを文字列で表現する形式。`{"key": "value"}` |
| UUID | 重複しないように自動生成される ID 文字列 |
| 非同期処理 | 時間のかかる処理を待っている間に他の処理を進める仕組み |
| async/await | 非同期処理を順番に書けるようにする構文 |
| ルーティング | URL に応じて表示するページを切り替える仕組み |
| FormData | ファイルを含むフォームのデータをまとめるオブジェクト |
| SVG | ブラウザで図形を描くための言語 |
| Tailwind CSS | クラス名でスタイルを指定する CSS フレームワーク |
| マイグレーション | 古いデータ形式を新しい形式に変換すること |
| DRY 原則 | 同じコードを繰り返さない設計の考え方 |

---

*このガイドは hanamaruko-create/Field-investigation-report のコードをもとに作成されました。*
