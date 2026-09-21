"use client";

import { useState } from "react";
import { Column } from "@/components/Column";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkillForm } from "@/components/SkillForm";
import { ApiError, browserApiUrl, createSkill, deleteSkill, fetchSkills, updateSkill } from "@/lib/api";
import { groupByStatus, removeSkill, replaceSkill, type SkillInput } from "@/lib/board";
import { STATUS_LABELS, STATUSES, type Skill, type Status } from "@/lib/types";

// 開いているフォームの中身: 追加(どの列に追加するか)か、編集(どのスキルを編集するか)
type FormTarget = { kind: "add"; status: Status } | { kind: "edit"; skill: Skill };

// スキルボード。3つの列(未習得・習得中・習得済み)を、左から並べる。
// スキルの一覧を、この部品が「状態」として持つ。操作(追加・編集・削除)をするたびに、状態を更新して、画面に反映する。
// initialSkills は、サーバーが API から取得した、最初の一覧。
export function Board({ initialSkills, today }: { initialSkills: Skill[]; today: string }) {
  const [skills, setSkills] = useState(initialSkills);
  const [form, setForm] = useState<FormTarget | null>(null); // 追加・編集フォームの、開いている中身(閉じているときは null)
  const [deleting, setDeleting] = useState<Skill | null>(null); // 削除の確認ダイアログの、対象(閉じているときは null)
  const [notice, setNotice] = useState<string | null>(null); // 画面の上に出す、お知らせ
  const columns = groupByStatus(skills);

  // 別の場所で、すでに削除されていた(404)ときに、API から最新の一覧を取り直す。取り直せたら true
  async function refreshFromServer(message: string): Promise<boolean> {
    try {
      setSkills(await fetchSkills(browserApiUrl()));
      setNotice(message);
      return true;
    } catch {
      return false; // 取り直せなかったときは、もとのエラーを、フォームやダイアログに表示する
    }
  }

  // 追加・編集フォームの「保存」。成功したら、画面に反映して、フォームを閉じる。
  // 失敗したら、例外がフォームに伝わり、フォームの中に、エラーが表示される。
  async function handleSubmit(target: FormTarget, input: SkillInput) {
    try {
      if (target.kind === "add") {
        const created = await createSkill(target.status, input);
        setSkills((current) => [...current, created]); // その列の末尾に増える(並び順は、サーバーが決めた値)
      } else {
        const updated = await updateSkill(target.skill.id, input);
        setSkills((current) => replaceSkill(current, updated));
      }
      setNotice(null);
      setForm(null);
    } catch (error) {
      if (target.kind === "edit" && error instanceof ApiError && error.status === 404) {
        const refreshed = await refreshFromServer(`「${target.skill.name}」は、すでに削除されていました。最新の状態に更新しました。`);
        if (refreshed) {
          setForm(null);
          return;
        }
      }
      throw error;
    }
  }

  // 削除の確認の「削除」。成功したら、画面から消して(同じ列の並び順を詰める)、ダイアログを閉じる。
  async function handleDelete(target: Skill) {
    try {
      await deleteSkill(target.id);
      setSkills((current) => removeSkill(current, target.id));
      setNotice(null);
      setDeleting(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const refreshed = await refreshFromServer(`「${target.name}」は、すでに削除されていました。最新の状態に更新しました。`);
        if (refreshed) {
          setDeleting(null);
          return;
        }
      }
      throw error;
    }
  }

  const editing = form?.kind === "edit" ? form.skill : null;

  return (
    <>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </div>
      )}

      <main className="board" aria-label="スキルボード">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            skills={columns[status]}
            today={today}
            onAdd={(addStatus) => setForm({ kind: "add", status: addStatus })}
            onEdit={(skill) => setForm({ kind: "edit", skill })}
            onDelete={setDeleting}
          />
        ))}
      </main>

      <SkillForm
        open={form !== null}
        heading={form?.kind === "add" ? `スキルを追加(${STATUS_LABELS[form.status]})` : "スキルを編集"}
        initial={
          editing
            ? { name: editing.name, note: editing.note ?? "", priority: editing.priority, dueDate: editing.dueDate ?? "" }
            : undefined
        }
        // 習得日は、習得済みのスキルの編集のときだけ、表示のみで出す
        readonlyAcquiredOn={editing?.status === "mastered" ? (editing.acquiredOn ?? "-") : undefined}
        onSubmit={(input) => handleSubmit(form!, input)}
        onCancel={() => setForm(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`「${deleting?.name ?? ""}」を削除しますか?`}
        message="この操作は取り消せません。"
        confirmLabel="削除"
        onConfirm={() => handleDelete(deleting!)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
