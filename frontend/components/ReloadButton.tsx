"use client";

// 「再読み込み」ボタン。ページ全体を読み込み直して、API から最新のスキルを取得し直す。
// (取得に失敗した画面など、サーバーの部品の中から使うため、ボタンの部分だけを、クライアントの部品にしてある)
export function ReloadButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.location.reload()}>
      再読み込み
    </button>
  );
}
