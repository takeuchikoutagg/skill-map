import { ReloadButton } from "@/components/ReloadButton";
import { ApiError } from "@/lib/api";

// 取得に失敗したときに、画面に出す文章を作る。
// (部品には、Error オブジェクトそのものではなく、この文章を渡す。Next.js の開発サーバーは、サーバーの部品どうしで受け渡す値を
//  画面表示のために送り出すため、Error オブジェクトを渡すと、その送り出しに失敗して、ページが完成しなくなる)
//
// API の場所(URL)は、ここには出さない。本番では、サーバー用の API の場所が、Docker の内部のホスト名など、
// 外に見せる必要のない値になることがある。原因の詳細は、サーバー側のログにだけ残す(app/page.tsx)。
export function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `API がエラーを返しました(HTTP ${error.status})。${error.messages.join(" ")}`.trim();
  }
  // 時間切れの例外は、実行環境によって Error として扱われないことがあるので、名前で判断する
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return "API から、時間内に返事がありませんでした。";
  }
  return "API に接続できませんでした。";
}

// スキルの取得に失敗したときの表示。原因(API が動いていない、API がエラーを返した)と、確かめることを伝える。
// role="alert" は、main そのものではなく、中の div に付ける(main に付けると、main の「主要な内容」という
// ランドマークとしての役割が、alert に上書きされて、消えてしまう)。
export function LoadError({ message }: { message: string }) {
  return (
    <main className="load-error">
      <div role="alert">
        <h2>スキルを取得できませんでした</h2>
        <p>{message}</p>
        <p className="hint">バックエンド(API)が動いているかを確かめてから、「再読み込み」を押してください。</p>
        <ReloadButton />
      </div>
    </main>
  );
}
