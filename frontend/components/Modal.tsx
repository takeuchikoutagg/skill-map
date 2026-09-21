"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";

type Props = {
  open: boolean; // 開いているか
  labelledBy: string; // 見出しの id(スクリーンリーダーなどに、ダイアログの名前を伝える)
  busyRef: RefObject<boolean>; // 保存中・削除中か。保存中は、Esc や背景のクリックでは、閉じない
  onCancel: () => void; // 閉じる(Esc、背景のクリック)
  children: ReactNode;
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

// ダイアログの、共通の仕組み(追加・編集フォーム、削除の確認で使う)。
// <dialog> の箱は、いつも画面に置いておき、開閉だけを切り替える(閉じるときに、押したボタンへフォーカスが戻る)。
// 中身(children)は、開いているときだけ作る。開くたびに、作り直される(前の入力が残らない)。
export function Modal({ open, labelledBy, busyRef, onCancel, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) openDialog(dialog);
    if (!open && dialog.open) closeDialog(dialog);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      // Esc キー。ブラウザの標準の閉じ方は使わず、こちらで閉じる(保存中は、閉じない)
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onCancel();
      }}
      // ダイアログの外側(暗い背景)のクリック
      onClick={(event: MouseEvent<HTMLDialogElement>) => {
        if (event.target === event.currentTarget && !busyRef.current) onCancel();
      }}
    >
      {open && children}
    </dialog>
  );
}
