"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";
import { SortableSkillCard } from "@/components/SortableSkillCard";
import { columnDropId } from "@/lib/drag";
import { STATUS_LABELS, type Skill, type Status } from "@/lib/types";

// 列1つ(未習得・習得中・習得済みのどれか)。docs/03-画面一覧.md の「列の見出し」の表示項目どおり。
type Props = {
  status: Status;
  skills: Skill[];
  today: string;
  onAdd: (status: Status) => void; // 「+ スキルを追加」が押されたとき
  onEdit: (skill: Skill) => void; // カードがクリックされたとき
  onDelete: (skill: Skill) => void; // カードの「削除」が押されたとき
  onSort: (status: Status) => void; // 「優先度順」が押されたとき
  sortDisabled: boolean; // 「優先度順」を押せないか(並べ替え・移動の通信中、ドラッグ中)
  sorting: boolean; // この列の、並べ替えの通信中か(ボタンに「並べ替え中…」と出す)
  highlighted: boolean; // ドラッグ中に、ここに置かれる列か(枠を強調する)
  busy: boolean; // 移動・並べ替えの通信中か(通信中は、ドラッグ・編集・削除・追加を受け付けない)
};

export function Column({ status, skills, today, onAdd, onEdit, onDelete, onSort, sortDisabled, sorting, highlighted, busy }: Props) {
  // 列そのものを、ドロップ先にする(空の列にも、カードを置けるように)
  const { setNodeRef } = useDroppable({ id: columnDropId(status) });
  const headingId = `list-${status}`;
  // 「優先度順」ボタンと「+ スキルを追加」ボタンは、未習得・習得中の列にだけ置く(習得済みには置かない)
  const editable = status !== "mastered";
  const canSort = skills.length >= 2; // 1件以下なら、並べ替える意味がない

  // SortableContext に渡す、カードの id の並び。
  // 中身が同じなら、同じ配列を渡し続ける(描画のたびに、新しい配列を作って渡してはいけない)。
  // @dnd-kit は「渡された配列が、前と違うか」で、カードの位置を測り直す。測り直すと再描画が起きて、また新しい配列が渡されて、
  // …と、際限なく繰り返し、「Maximum update depth exceeded」のエラーで画面が壊れることがある(習得中 → 習得済みのドラッグで実際に起きた)。
  const idsKey = skills.map((skill) => skill.id).join(",");
  const ids = useMemo(() => (idsKey === "" ? [] : idsKey.split(",").map(Number)), [idsKey]);

  return (
    <section
      ref={setNodeRef}
      className={`list${status === "mastered" ? " list-done" : ""}${highlighted ? " drop-target" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="list-head">
        {/* tabIndex={-1}: Tab では止まらないが、削除のあとなどに、プログラムからフォーカスを移せる */}
        <h2 id={headingId} tabIndex={-1}>
          {STATUS_LABELS[status]}
        </h2>
        <div className="list-tools">
          <span className="count" title="スキルの件数">
            {skills.length}
            <span className="sr-only">件</span>
          </span>
          {editable && (
            <button
              type="button"
              className="sort-btn"
              disabled={sortDisabled || !canSort}
              aria-describedby={headingId} // 「優先度順、未習得」のように、どの列のボタンかも、読み上げられる
              title={canSort ? "優先度の高い順(高 → 中 → 低)に並べ替えます" : "スキルが2件以上あると、並べ替えできます"}
              onClick={() => onSort(status)}
            >
              {sorting ? "並べ替え中…" : "優先度順"}
            </button>
          )}
        </div>
      </div>

      <div className="cards">
        {skills.length === 0 && <p className="empty">スキルがありません</p>}
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {skills.map((skill) => (
            <SortableSkillCard key={skill.id} skill={skill} today={today} disabled={busy} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </SortableContext>
      </div>

      {editable && (
        <button type="button" className="add-skill" aria-describedby={headingId} disabled={busy} onClick={() => onAdd(status)}>
          + スキルを追加
        </button>
      )}
    </section>
  );
}
