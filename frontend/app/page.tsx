import { Board } from "@/components/Board";
import { LoadError, loadErrorMessage } from "@/components/LoadError";
import { fetchSkills, serverApiUrl } from "@/lib/api";
import { todayInTokyo } from "@/lib/board";
import type { Skill } from "@/lib/types";

// 表示のたびに、API から最新のスキルを取得する。
// (ビルドのときに取得して、そのまま固定してしまわないようにする。バックエンドが動いていなくても、ビルドは通る)
export const dynamic = "force-dynamic";

// スキルボードの画面。スキルは、Next.js のサーバーが API から取得して、表示する
// (サーバーどうしの通信なので、CORS は関係ない)。
export default async function Home() {
  // 「今日」は、サーバーで日本時間の日付を作って渡す(サーバーとブラウザで、期限切れの判定が食い違わないように)
  const today = todayInTokyo();

  let skills: Skill[];
  try {
    skills = await fetchSkills();
  } catch (error) {
    return <LoadError message={loadErrorMessage(error, serverApiUrl())} />;
  }

  return <Board initialSkills={skills} today={today} />;
}
