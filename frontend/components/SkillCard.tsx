import { isOverdue } from "@/lib/board";
import { PRIORITY_LABELS, type Skill } from "@/lib/types";

const COMING_SOON = "この機能は、次のステップで作ります";

// スキル1件のカード。docs/03-画面一覧.md の「スキルカード」の表示項目どおり。
export function SkillCard({ skill, today }: { skill: Skill; today: string }) {
  const overdue = isOverdue(skill, today);

  return (
    <article className="card">
      <h3>{skill.name}</h3>

      <p className="meta">
        <span className={`prio prio-${skill.priority}`}>優先度: {PRIORITY_LABELS[skill.priority]}</span>
        <span className={`due${overdue ? " overdue" : ""}`}>
          期限: {skill.dueDate ?? "-"}
          {overdue ? "(期限切れ)" : ""}
        </span>
      </p>

      {/* 習得日は、習得済みのカードにだけ表示する */}
      {skill.status === "mastered" && <p className="acquired">習得日: {skill.acquiredOn ?? "-"}</p>}

      {skill.note && <p className="note">{skill.note}</p>}

      <button type="button" className="delete" disabled title={COMING_SOON}>
        削除
      </button>
    </article>
  );
}
