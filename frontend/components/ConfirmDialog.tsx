"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { toFormErrors } from "@/lib/skill-form";

type Props = {
  open: boolean; // 開いているか
  title: string; // 見出し。例: 「レジ締め」を削除しますか?
  message: string; // 説明。例: この操作は取り消せません。
  confirmLabel: string; // 実行するボタンの文字。例: 削除
  onConfirm: () => Promise<void>; // 実行する。失敗したら、例外を投げる(ダイアログの中に表示する)
  onCancel: () => void; // 閉じる(キャンセル、Esc、背景のクリック)
};

// 確認のダイアログ(スキルの削除の前に出す)。docs/03-画面一覧.md の「S-03 スキル削除の確認」。
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const busyRef = useRef(false); // 実行中か(実行中は、閉じられない)

  return (
    <Modal open={open} labelledBy="confirm-title" busyRef={busyRef} onCancel={onCancel}>
      <ConfirmBody
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        busyRef={busyRef}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  );
}

type BodyProps = Omit<Props, "open"> & { busyRef: React.RefObject<boolean> };

function ConfirmBody({ title, message, confirmLabel, busyRef, onConfirm, onCancel }: BodyProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (busyRef.current) return; // 二重に実行しない
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(); // 成功したら、親がダイアログを閉じる
    } catch (caught) {
      setError(toFormErrors(caught).general ?? "実行できませんでした。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="dialog-body dialog-small">
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={handleConfirm}>
          {busy ? "実行中…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
