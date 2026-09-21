"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback } from "react";
import { SkillCard } from "@/components/SkillCard";
import type { Skill } from "@/lib/types";

type Props = {
  skill: Skill;
  today: string;
  disabled: boolean; // ドラッグできないか(移動の通信中は、次のドラッグを受け付けない)
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
};

// ドラッグできるカード。@dnd-kit/sortable の useSortable で、つかめる・並び替えの動きをつける。
export function SortableSkillCard({ skill, today, disabled, onEdit, onDelete }: Props) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: skill.id, disabled });

  // カード本体を、「つかむ操作を受け付ける要素」としても、@dnd-kit に教える。
  // 教えないと、カードの中のボタン(スキル名・削除)で押した Enter や Space まで、「つかむ」操作にされて、ボタンが使えなくなる。
  // (関数は、useCallback で、描画のたびに作り直さない。作り直すと、そのたびに、つけ外しが起きる)
  const setRef = useCallback(
    (element: HTMLElement | null) => {
      setNodeRef(element);
      setActivatorNodeRef(element);
    },
    [setNodeRef, setActivatorNodeRef],
  );

  return (
    <SkillCard
      skill={skill}
      today={today}
      onEdit={onEdit}
      onDelete={onDelete}
      dragging={isDragging}
      drag={{
        ref: setRef,
        style: { transform: CSS.Transform.toString(transform), transition },
        ...attributes,
        // <article> の中に、ボタン(スキル名・削除)があるので、カード自体を「ボタン」とは扱わない
        // (キーボードで、カードにフォーカスして、Space でつかむ操作は、そのまま使える)
        role: undefined,
        "aria-roledescription": undefined,
        ...listeners,
      }}
    />
  );
}
