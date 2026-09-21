import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ApiError } from "@/lib/api";

const TITLE = "「レジ締め」を削除しますか?";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog open title={TITLE} message="この操作は取り消せません。" confirmLabel="削除" onConfirm={onConfirm} onCancel={onCancel} {...overrides} />,
  );
  return { onConfirm, onCancel, ...view };
}

const confirmButton = () => screen.getByRole("button", { name: /削除|実行中/ });

describe("ConfirmDialog(確認のダイアログ)", () => {
  it("開いていると、見出し・説明・2つのボタン(キャンセル・実行)が出る", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByText("この操作は取り消せません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
  });

  it("閉じているときは、中身を出さない", () => {
    const { container } = renderDialog({ open: false });

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
    expect(screen.queryByText("この操作は取り消せません。")).not.toBeInTheDocument();
  });

  it("実行ボタンを押すと、onConfirm が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("実行中は、ボタンを押せず、「実行中…」と表示する。二重に実行しない", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onConfirm = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    renderDialog({ onConfirm });

    await user.click(confirmButton());
    expect(screen.getByRole("button", { name: "実行中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    fireEvent.click(confirmButton()); // 無効なボタンでも、もう一度、送られても
    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });

  it("画面が更新される前の、同じ瞬間に、2回押されても、1回だけ実行する(ボタンが無効になる前の2回目)", () => {
    // 実行中は、ボタンが無効になるが、それは画面の更新のあと。更新の前に、2回目が届いた場合は、
    // 「実行中なら、何もしない」という確認(busyRef)だけが、二重の実行を防ぐ
    const onConfirm = vi.fn().mockImplementation(() => new Promise<void>(() => {})); // 終わらない実行
    renderDialog({ onConfirm });
    const button = confirmButton();

    act(() => {
      button.click(); // この中では、画面の更新は、最後にまとめて行われる。2回目のクリックは、ボタンがまだ有効な間に届く
      button.click();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("失敗したら、ダイアログの中にエラーを出し、閉じない。もう一度、試せる", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(undefined);
    renderDialog({ onConfirm });

    await user.click(confirmButton());

    expect(await screen.findByText("API に接続できませんでした。バックエンドが動いているかを確かめてください。")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();

    await user.click(confirmButton());
    await waitFor(() => expect(screen.queryByText(/API に接続できませんでした/)).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("API がエラーを返したときは、そのメッセージを出す", async () => {
    const user = userEvent.setup();
    renderDialog({ onConfirm: vi.fn().mockRejectedValue(new ApiError(500, { base: ["サーバーで問題が起きました。"] })) });

    await user.click(confirmButton());

    expect(await screen.findByText("サーバーで問題が起きました。")).toBeInTheDocument();
  });

  it("「キャンセル」・Esc・背景のクリックで、onCancel が呼ばれる。中身のクリックでは、呼ばれない", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(screen.getByRole("heading", { name: TITLE }));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await user.click(screen.getByRole("dialog"));

    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("実行中は、Esc や背景のクリックでは、閉じない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockImplementation(() => new Promise<void>(() => {})); // 終わらない実行
    const { onCancel } = renderDialog({ onConfirm });
    await user.click(confirmButton());

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await user.click(screen.getByRole("dialog"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
