import { Column } from "@/components/Column";
import { groupByStatus } from "@/lib/board";
import { STATUSES, type Skill } from "@/lib/types";

// スキルボード。3つの列(未習得・習得中・習得済み)を、左から並べる。
// 今は表示だけ。追加・編集・移動などの操作は、次のステップ以降で作る(そのときに、状態を持つ部品にする)。
export function Board({ skills, today }: { skills: Skill[]; today: string }) {
  const columns = groupByStatus(skills);

  return (
    <main className="board" aria-label="スキルボード">
      {STATUSES.map((status) => (
        <Column key={status} status={status} skills={columns[status]} today={today} />
      ))}
    </main>
  );
}
