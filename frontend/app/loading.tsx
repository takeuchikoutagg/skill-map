// ページを開いたとき、Next.js のサーバーが API からスキルを取得するあいだ(取得が終わるまで)、表示する画面。
export default function Loading() {
  return (
    <main className="loading" role="status">
      読み込み中…
    </main>
  );
}
