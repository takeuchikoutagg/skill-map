"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Modal } from "@/components/Modal";
import { validateSkillInput, type SkillInput, type SkillInputErrors } from "@/lib/board";
import { toFormErrors, type SkillFormErrors } from "@/lib/skill-form";
import { NAME_MAX, NOTE_MAX, PRIORITIES, PRIORITY_LABELS } from "@/lib/types";

// 画面に並んでいる順番。検証で複数の項目が引っかかったとき、いちばん上の項目に、フォーカスを移す
const FIELD_ORDER: (keyof SkillInputErrors)[] = [ "name", "priority", "dueDate", "note" ];

type Props = {
  open: boolean; // 開いているか
  heading: string; // 見出し。例: 「スキルを追加(未習得)」「スキルを編集」
  initial?: SkillInput; // 最初に入れておく値(編集のとき。追加のときは、空の状態から)
  readonlyAcquiredOn?: string; // 習得日(表示のみ。編集できない)。習得済みのスキルの編集のときだけ、渡す
  onSubmit: (input: SkillInput) => Promise<void>; // 保存する。失敗したら、例外を投げる(フォームに表示する)
  onCancel: () => void; // 閉じる(キャンセル、Esc、背景のクリック)
};

const EMPTY_INPUT: SkillInput = { name: "", note: "", priority: "medium", dueDate: "" }; // 追加のときの、最初の値(優先度は「中」)

// スキルの入力フォーム(ダイアログ)。追加と編集で、共用する。docs/03-画面一覧.md の「S-02 スキル追加・編集フォーム」。
// ダイアログの開閉の仕組みは Modal。入力の中身は、開くたびに、最初の値から始める(FormBody を、開くたびに作り直す)。
export function SkillForm({ open, heading, initial, readonlyAcquiredOn, onSubmit, onCancel }: Props) {
  const savingRef = useRef(false); // 保存中か(保存中は、閉じられない)

  return (
    <Modal open={open} labelledBy="skill-form-title" busyRef={savingRef} onCancel={onCancel}>
      <FormBody
        heading={heading}
        initial={initial ?? EMPTY_INPUT}
        readonlyAcquiredOn={readonlyAcquiredOn}
        savingRef={savingRef}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Modal>
  );
}

type FormBodyProps = {
  heading: string;
  initial: SkillInput;
  readonlyAcquiredOn?: string;
  savingRef: RefObject<boolean>;
  onSubmit: (input: SkillInput) => Promise<void>;
  onCancel: () => void;
};

function FormBody({ heading, initial, readonlyAcquiredOn, savingRef, onSubmit, onCancel }: FormBodyProps) {
  const [name, setName] = useState(initial.name);
  const [priority, setPriority] = useState(initial.priority);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<SkillFormErrors>({});
  const [saving, setSaving] = useState(false);

  // 項目ごとの入力欄(検証に失敗したとき、最初の不正な項目に、フォーカスを移すため)
  const nameRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLSelectElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const fieldRefs: Record<keyof SkillInputErrors, RefObject<HTMLElement | null>> = {
    name: nameRef,
    priority: priorityRef,
    dueDate: dueDateRef,
    note: noteRef,
  };

  // 画面の上から順に、最初にエラーのある項目へ、フォーカスを移す(キーボード・スクリーンリーダーの人が、
  // 直すべき場所へ、すぐたどり着けるように。役割(role="alert")だけでは、そこへは移動しない)
  function focusFirstInvalid(fieldErrors: SkillFormErrors) {
    const field = FIELD_ORDER.find((name) => fieldErrors[name]);
    if (field) fieldRefs[field].current?.focus();
  }

  // 項目を直しているとき、その項目のエラーだけを消す(保存し直すまで、直したあとも、赤いままにしない)
  function clearFieldError(field: keyof SkillInputErrors) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return; // 二重送信を防ぐ(保存中に、もう一度押されても、何もしない)

    const input: SkillInput = { name, note, priority, dueDate };
    const clientErrors = validateSkillInput(input); // まず、画面側で入力をチェックする(通信しない)
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstInvalid(clientErrors);
      return;
    }

    setErrors({});
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit(input); // 成功したら、親がフォームを閉じる
    } catch (error) {
      const formErrors = toFormErrors(error); // サーバーのエラー(422 など)を、項目の下に表示する
      setErrors(formErrors);
      focusFirstInvalid(formErrors);
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
          ref={nameRef}
          id="skill-name"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoFocus
          placeholder="例: レジ締め"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby="skill-name-error"
          onChange={(event) => {
            setName(event.target.value);
            clearFieldError("name");
          }}
        />
        <p className="error" id="skill-name-error" role="alert">
          {errors.name}
        </p>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="skill-priority">優先度</label>
          <select
            ref={priorityRef}
            id="skill-priority"
            value={priority}
            aria-invalid={errors.priority ? true : undefined}
            aria-describedby="skill-priority-error"
            onChange={(event) => {
              setPriority(event.target.value);
              clearFieldError("priority");
            }}
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
            ref={dueDateRef}
            id="skill-due-date"
            type="date"
            value={dueDate}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby="skill-due-date-error"
            onChange={(event) => {
              setDueDate(event.target.value);
              clearFieldError("dueDate");
            }}
          />
          <p className="error" id="skill-due-date-error" role="alert">
            {errors.dueDate}
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="skill-note">ポイント・考察</label>
        <textarea
          ref={noteRef}
          id="skill-note"
          rows={4}
          value={note}
          maxLength={NOTE_MAX}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby="skill-note-error"
          onChange={(event) => {
            setNote(event.target.value);
            clearFieldError("note");
          }}
        />
        <p className="error" id="skill-note-error" role="alert">
          {errors.note}
        </p>
      </div>

      {/* 習得日は、習得済みのスキルの編集のときだけ、表示のみで出す(編集はできない。サーバーが自動で記録する) */}
      {readonlyAcquiredOn !== undefined && (
        <p className="readonly">習得日: {readonlyAcquiredOn}(自動で記録されるため、編集できません)</p>
      )}

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
