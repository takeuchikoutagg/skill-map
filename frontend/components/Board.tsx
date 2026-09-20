"use client";

import { useState } from "react";
import { Column } from "@/components/Column";
import { SkillForm } from "@/components/SkillForm";
import { createSkill } from "@/lib/api";
import { groupByStatus, type SkillInput } from "@/lib/board";
import { STATUS_LABELS, STATUSES, type Skill, type Status } from "@/lib/types";

// スキルボード。3つの列(未習得・習得中・習得済み)を、左から並べる。
// スキルの一覧を、この部品が「状態」として持つ。操作(追加など)をするたびに、状態を更新して、画面に反映する。
// initialSkills は、サーバーが API から取得した、最初の一覧。
export function Board({ initialSkills, today }: { initialSkills: Skill[]; today: string }) {
  const [skills, setSkills] = useState(initialSkills);
  const [addingStatus, setAddingStatus] = useState<Status | null>(null); // 追加フォームを開いている列(閉じているときは null)
  const columns = groupByStatus(skills);

  // 追加フォームの「保存」。API に追加して、成功したら、その列の末尾にカードを足して、フォームを閉じる。
  // 失敗したら、例外がフォームに伝わり、フォームの中に、エラーが表示される。
  async function handleCreate(status: Status, input: SkillInput) {
    const created = await createSkill(status, input);
    setSkills((current) => [...current, created]);
    setAddingStatus(null);
  }

  return (
    <>
      <main className="board" aria-label="スキルボード">
        {STATUSES.map((status) => (
          <Column key={status} status={status} skills={columns[status]} today={today} onAdd={setAddingStatus} />
        ))}
      </main>

      <SkillForm
        open={addingStatus !== null}
        heading={addingStatus ? `スキルを追加(${STATUS_LABELS[addingStatus]})` : "スキルを追加"}
        onSubmit={(input) => handleCreate(addingStatus!, input)}
        onCancel={() => setAddingStatus(null)}
      />
    </>
  );
}
