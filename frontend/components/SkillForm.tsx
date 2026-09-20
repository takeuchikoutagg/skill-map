"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { validateSkillInput, type SkillInput } from "@/lib/board";
import { toFormErrors, type SkillFormErrors } from "@/lib/skill-form";
import { NAME_MAX, NOTE_MAX, PRIORITIES, PRIORITY_LABELS } from "@/lib/types";

type Props = {
  open: boolean; // 開いているか
  heading: string; // 見出し。例: 「スキルを追加(未習得)」
  onSubmit: (input: SkillInput) => Promise<void>; // 保存する。失敗したら、例外を投げる(フォームに表示する)
  onCancel: () => void; // 閉じる(キャンセル、Esc、背景のクリック)
};

// <dialog> を開く・閉じる。テストで使う jsdom には、showModal / close がないので、その場合は open 属性で代用する
function openDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

// スキルの入力フォーム(ダイアログ)。docs/03-画面一覧.md の「S-02 スキル追加・編集フォーム」。
// ダイアログの箱は、いつも画面に置いておき、開閉だけを切り替える(閉じるときに、押したボタンへフォーカスが戻る)。
// 入力の中身は、開くたびに、空の状態から始める(FormBody を、開くたびに作り直す)。
export function SkillForm({ open, heading, onSubmit, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false); // 保存中か(保存中は、閉じられない)

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) openDialog(dialog);
    if (!open && dialog.open) closeDialog(dialog);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="skill-form-title"
      // Esc キー。ブラウザの標準の閉じ方は使わず、こちらで閉じる(保存中は、閉じない)
      onCancel={(event) => {
        event.preventDefault();
        if (!savingRef.current) onCancel();
      }}
      // ダイアログの外側(暗い背景)のクリック
      onClick={(event: MouseEvent<HTMLDialogElement>) => {
        if (event.target === event.currentTarget && !savingRef.current) onCancel();
      }}
    >
      {open && <FormBody heading={heading} savingRef={savingRef} onSubmit={onSubmit} onCancel={onCancel} />}
    </dialog>
  );
}

type FormBodyProps = {
  heading: string;
  savingRef: React.RefObject<boolean>;
  onSubmit: (input: SkillInput) => Promise<void>;
  onCancel: () => void;
};

function FormBody({ heading, savingRef, onSubmit, onCancel }: FormBodyProps) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("medium"); // 初期値は「中」
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<SkillFormErrors>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return; // 二重送信を防ぐ(保存中に、もう一度押されても、何もしない)

    const input: SkillInput = { name, note, priority, dueDate };
    const clientErrors = validateSkillInput(input); // まず、画面側で入力をチェックする(通信しない)
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit(input); // 成功したら、親がフォームを閉じる
    } catch (error) {
      setErrors(toFormErrors(error)); // サーバーのエラー(422 など)を、項目の下に表示する
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="dialog-body" noValidate onSubmit={handleSubmit}>
      <h2 id="skill-form-title">{heading}</h2>

      {errors.general && (
        <p className="form-error" role="alert">
          {errors.general}
        </p>
      )}

      <div className="field">
        <label htmlFor="skill-name">
          スキル名 <em>必須</em>
        </label>
        <input
          id="skill-name"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoFocus
          placeholder="例: レジ締め"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby="skill-name-error"
          onChange={(event) => setName(event.target.value)}
        />
        <p className="error" id="skill-name-error" role="alert">
          {errors.name}
        </p>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="skill-priority">優先度</label>
          <select
            id="skill-priority"
            value={priority}
            aria-invalid={errors.priority ? true : undefined}
            aria-describedby="skill-priority-error"
            onChange={(event) => setPriority(event.target.value)}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="error" id="skill-priority-error" role="alert">
            {errors.priority}
          </p>
        </div>

        <div className="field">
          <label htmlFor="skill-due-date">期限</label>
          <input
            id="skill-due-date"
            type="date"
            value={dueDate}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby="skill-due-date-error"
            onChange={(event) => setDueDate(event.target.value)}
          />
          <p className="error" id="skill-due-date-error" role="alert">
            {errors.dueDate}
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="skill-note">ポイント・考察</label>
        <textarea
          id="skill-note"
          rows={4}
          value={note}
          maxLength={NOTE_MAX}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby="skill-note-error"
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="error" id="skill-note-error" role="alert">
          {errors.note}
        </p>
      </div>

      <div className="actions">
        <button type="button" className="btn" disabled={saving} onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
