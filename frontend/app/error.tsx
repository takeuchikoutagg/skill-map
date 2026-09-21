"use client";

import { useEffect } from "react";

// 画面の表示中に、予期しないエラーが起きたときの、代わりの画面(Next.js の標準の英語の画面の代わり)。
// 「再読み込み」で、スキルの取得と表示を、やり直す(retry)。ボードの状態は作り直されるが、保存済みのデータは、サーバーにある。
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error); // 原因を調べられるように、ブラウザのコンソールに残す
  }, [error]);

  return (
    <main className="load-error" role="alert">
      <h2>画面の表示中に、エラーが起きました</h2>
      <p>一時的な問題かもしれません。保存済みのスキルは、失われていません。</p>
      <p className="hint">「再読み込み」を押しても直らないときは、ブラウザのページを再読み込みしてください。</p>
      <button type="button" className="btn primary" onClick={() => retry()}>
        再読み込み
      </button>
    </main>
  );
}
