import { isOverdue } from "@/lib/board";
import { PRIORITY_LABELS, type Skill } from "@/lib/types";

type Props = {
  skill: Skill;
  today: string;
  onEdit: (skill: Skill) => void; // カードがクリックされたとき(編集フォームを開く)
  onDelete: (skill: Skill) => void; // 「削除」が押されたとき(確認ダイアログを開く)
};

// スキル1件のカード。docs/03-画面一覧.md の「スキルカード」の表示項目どおり。
export function SkillCard({ skill, today, onEdit, onDelete }: Props) {
  const overdue = isOverdue(skill, today);

  return (
    // カードのどこをクリックしても、編集フォームが開く。キーボードで操作する人のために、スキル名は、ボタンにしてある
    <article className="card" onClick={() => onEdit(skill)}>
      <h3>
        <button type="button" className="card-title">
          {skill.name}
        </button>
      </h3>

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

      <button
        type="button"
        className="delete"
        aria-label={`「${skill.name}」を削除`}
        onClick={(event) => {
          event.stopPropagation(); // カード全体のクリック(編集を開く)まで、働かせない
          onDelete(skill);
        }}
      >
        削除
      </button>
    </article>
  );
}
