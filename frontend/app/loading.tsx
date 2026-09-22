// ページを開いたとき、Next.js のサーバーが API からスキルを取得するあいだ(取得が終わるまで)、表示する画面。
// role="status" は、main ではなく、中の div に付ける(main の、ランドマークとしての役割を消さないため)。
export default function Loading() {
  return (
    <main className="loading">
      <div role="status">読み込み中…</div>
    </main>
  );
}
