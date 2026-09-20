import { ApiError } from "@/lib/api";

// 取得に失敗したときに、画面に出す文章を作る。
// (部品には、Error オブジェクトそのものではなく、この文章を渡す。Next.js の開発サーバーは、サーバーの部品どうしで受け渡す値を
//  画面表示のために送り出すため、Error オブジェクトを渡すと、その送り出しに失敗して、ページが完成しなくなる)
export function loadErrorMessage(error: unknown, apiUrl: string): string {
  if (error instanceof ApiError) {
    return `API がエラーを返しました(HTTP ${error.status})。${error.messages.join(" ")}`.trim();
  }
  // 時間切れの例外は、実行環境によって Error として扱われないことがあるので、名前で判断する
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return `API(${apiUrl})から、時間内に返事がありませんでした。`;
  }
  return `API(${apiUrl})に接続できませんでした。`;
}

// スキルの取得に失敗したときの表示。原因(API が動いていない、API がエラーを返した)と、確かめることを伝える。
export function LoadError({ message }: { message: string }) {
  return (
    <main className="load-error" role="alert">
      <h2>スキルを取得できませんでした</h2>
      <p>{message}</p>
      <p className="hint">バックエンド(API)が動いているかを確かめてから、ページを再読み込みしてください。</p>
    </main>
  );
}
