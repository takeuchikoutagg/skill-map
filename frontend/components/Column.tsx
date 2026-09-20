import { SkillCard } from "@/components/SkillCard";
import { STATUS_LABELS, type Skill, type Status } from "@/lib/types";

const COMING_SOON = "この機能は、次のステップで作ります";

// 列1つ(未習得・習得中・習得済みのどれか)。docs/03-画面一覧.md の「列の見出し」の表示項目どおり。
type Props = {
  status: Status;
  skills: Skill[];
  today: string;
  onAdd: (status: Status) => void; // 「+ スキルを追加」が押されたとき
};

export function Column({ status, skills, today, onAdd }: Props) {
  const headingId = `list-${status}`;
  // 「優先度順」ボタンと「+ スキルを追加」ボタンは、未習得・習得中の列にだけ置く(習得済みには置かない)
  const editable = status !== "mastered";

  return (
    <section className={`list${status === "mastered" ? " list-done" : ""}`} aria-labelledby={headingId}>
      <div className="list-head">
        <h2 id={headingId}>{STATUS_LABELS[status]}</h2>
        <div className="list-tools">
          <span className="count" title="スキルの件数">
            {skills.length}
          </span>
          {editable && (
            <button type="button" className="sort-btn" disabled title={COMING_SOON}>
              優先度順
            </button>
          )}
        </div>
      </div>

      <div className="cards">
        {skills.length === 0 && <p className="empty">スキルがありません</p>}
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} today={today} />
        ))}
      </div>

      {editable && (
        <button type="button" className="add-skill" onClick={() => onAdd(status)}>
          + スキルを追加
        </button>
      )}
    </section>
  );
}
