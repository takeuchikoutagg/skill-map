import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { isOverdue } from "@/lib/board";
import { PRIORITY_LABELS, type Skill } from "@/lib/types";

// ドラッグ&ドロップのための、カード(<article>)に付ける属性。SortableSkillCard が用意する
export type CardDragProps = Omit<HTMLAttributes<HTMLElement>, "className" | "onClick" | "children"> & {
  ref?: Ref<HTMLElement>;
  style?: CSSProperties;
};

type Props = {
  skill: Skill;
  today: string;
  onEdit: (skill: Skill) => void; // カードがクリックされたとき(編集フォームを開く)
  onDelete: (skill: Skill) => void; // 「削除」が押されたとき(確認ダイアログを開く)
  drag?: CardDragProps; // ドラッグできるカードにするための属性(なければ、ただの表示)
  dragging?: boolean; // いま、このカードをドラッグしているか(元の場所に残る、薄いカード)
  overlay?: boolean; // ドラッグ中に、カーソルについて動く、コピーのカードか(クリックには、反応しない)
};

// スキル1件のカード。docs/03-画面一覧.md の「スキルカード」の表示項目どおり。
export function SkillCard({ skill, today, onEdit, onDelete, drag, dragging = false, overlay = false }: Props) {
  const overdue = isOverdue(skill, today);
  const className = `card${dragging ? " dragging" : ""}${overlay ? " overlay" : ""}`;

  return (
    // カードのどこをクリックしても、編集フォームが開く(少し動かすと、ドラッグになる)。
    // キーボードで操作する人のために、スキル名は、ボタンにしてある
    <article {...drag} className={className} onClick={overlay ? undefined : () => onEdit(skill)}>
      <h3>
        <button type="button" className="card-title" tabIndex={overlay ? -1 : undefined}>
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
        tabIndex={overlay ? -1 : undefined}
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
