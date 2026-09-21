import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillForm } from "@/components/SkillForm";
import { ApiError } from "@/lib/api";

const HEADING = "スキルを追加(未習得)";

function renderForm(overrides: Partial<React.ComponentProps<typeof SkillForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const view = render(<SkillForm open heading={HEADING} onSubmit={onSubmit} onCancel={onCancel} {...overrides} />);
  return { onSubmit, onCancel, ...view };
}

const nameInput = () => screen.getByLabelText(/スキル名/);
const saveButton = () => screen.getByRole("button", { name: /保存/ });

describe("SkillForm(追加フォーム)", () => {
  describe("表示", () => {
    it("開いていると、見出しと、4つの入力項目(スキル名・優先度・期限・ポイント・考察)が出る", () => {
      renderForm();

      expect(screen.getByRole("dialog", { name: HEADING })).toBeInTheDocument();
      expect(nameInput()).toHaveValue("");
      expect(screen.getByLabelText("優先度")).toHaveValue("medium"); // 初期値は「中」
      expect(screen.getByLabelText("期限")).toHaveValue("");
      expect(screen.getByLabelText("ポイント・考察")).toHaveValue("");
    });

    it("スキル名には「必須」と表示する。習得日の欄は、出さない", () => {
      renderForm();

      expect(screen.getByText("必須")).toBeInTheDocument();
      expect(screen.queryByText(/習得日/)).not.toBeInTheDocument();
    });

    it("優先度の選択肢は、高・中・低の順", () => {
      renderForm();

      const options = Array.from((screen.getByLabelText("優先度") as HTMLSelectElement).options).map((o) => o.textContent);
      expect(options).toEqual(["高", "中", "低"]);
    });

    it("開いたとき、スキル名の入力欄に、フォーカスがある", () => {
      renderForm();

      expect(nameInput()).toHaveFocus();
    });

    it("閉じているときは、ダイアログを開かない(open 属性がない)", () => {
      const { container } = renderForm({ open: false });

      expect(container.querySelector("dialog")).not.toHaveAttribute("open");
      expect(screen.queryByLabelText(/スキル名/)).not.toBeInTheDocument();
    });

    it("閉じて、また開くと、入力の中身は空から始まる", async () => {
      const user = userEvent.setup();
      const { rerender, onSubmit, onCancel } = renderForm();
      await user.type(nameInput(), "書きかけのスキル");

      rerender(<SkillForm open={false} heading={HEADING} onSubmit={onSubmit} onCancel={onCancel} />);
      rerender(<SkillForm open heading={HEADING} onSubmit={onSubmit} onCancel={onCancel} />);

      expect(nameInput()).toHaveValue("");
    });
  });

  describe("入力チェック(画面側。通信しない)", () => {
    it("スキル名が空だと、エラーを出し、保存しない", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.click(saveButton());

      expect(screen.getByText("スキル名を入力してください。")).toBeInTheDocument();
      expect(nameInput()).toHaveAttribute("aria-invalid", "true");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("スキル名が空白だけ(全角も)でも、エラー", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), "　 ");
      await user.click(saveButton());

      expect(screen.getByText("スキル名を入力してください。")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("スキル名が101文字だと、エラー", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      fireEvent.change(nameInput(), { target: { value: "あ".repeat(101) } }); // 入力欄の maxLength を超える値を、直接入れる
      await user.click(saveButton());

      expect(screen.getByText("スキル名は100文字以内で入力してください。")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("ポイント・考察が5,001文字だと、エラー", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), "レジ締め");
      fireEvent.change(screen.getByLabelText("ポイント・考察"), { target: { value: "あ".repeat(5001) } });
      await user.click(saveButton());

      expect(screen.getByText("ポイント・考察は5,000文字以内で入力してください。")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("入力を直して、もう一度保存すると、エラーが消えて保存される", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();
      await user.click(saveButton());
      expect(screen.getByText("スキル名を入力してください。")).toBeInTheDocument();

      await user.type(nameInput(), "レジ締め");
      await user.click(saveButton());

      expect(screen.queryByText("スキル名を入力してください。")).not.toBeInTheDocument();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe("保存", () => {
    it("入力した内容を、onSubmit に渡す", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), "請求書の発行");
      await user.selectOptions(screen.getByLabelText("優先度"), "high");
      fireEvent.change(screen.getByLabelText("期限"), { target: { value: "2026-10-31" } });
      await user.type(screen.getByLabelText("ポイント・考察"), "締め日に注意");
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        name: "請求書の発行",
        note: "締め日に注意",
        priority: "high",
        dueDate: "2026-10-31",
      });
    });

    it("スキル名だけでも保存できる(優先度は中、期限とポイントは空)", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), "クレーム対応");
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledWith({ name: "クレーム対応", note: "", priority: "medium", dueDate: "" });
    });

    it("スキル名の欄で Enter を押しても、保存される", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), "クレーム対応{Enter}");

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("保存中は、ボタンを押せず、「保存中…」と表示する。二重に送らない", async () => {
      const user = userEvent.setup();
      let finish: () => void = () => {};
      const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      renderForm({ onSubmit });
      await user.type(nameInput(), "クレーム対応");

      await user.click(saveButton());
      expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
      fireEvent.submit(nameInput().closest("form")!); // Enter などで、もう一度送られても
      fireEvent.submit(nameInput().closest("form")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);

      finish();
      await waitFor(() => expect(saveButton()).toBeEnabled());
    });
  });

  describe("サーバーのエラー(保存に失敗したとき。入力は、消さない)", () => {
    it("422: 項目ごとのメッセージを、その項目の下に出す", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(
        new ApiError(422, { name: ["スキル名は重複しています"], due_date: ["期限は不正な値です"] }),
      );
      renderForm({ onSubmit });
      await user.type(nameInput(), "クレーム対応");

      await user.click(saveButton());

      expect(await screen.findByText("スキル名は重複しています")).toBeInTheDocument();
      expect(screen.getByText("期限は不正な値です")).toBeInTheDocument();
      expect(nameInput()).toHaveAttribute("aria-invalid", "true");
      expect(nameInput()).toHaveValue("クレーム対応"); // 入力は、そのまま
      expect(saveButton()).toBeEnabled(); // 直して、もう一度、保存できる
    });

    it("項目に結びつかないエラーや、接続できないエラーは、フォームの上に出す", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
      renderForm({ onSubmit });
      await user.type(nameInput(), "クレーム対応");

      await user.click(saveButton());

      expect(await screen.findByText("API に接続できませんでした。バックエンドが動いているかを確かめてください。")).toBeInTheDocument();
      expect(nameInput()).toHaveValue("クレーム対応");
    });

    it("もう一度保存して成功すると、前のエラーは消える", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(undefined);
      renderForm({ onSubmit });
      await user.type(nameInput(), "クレーム対応");
      await user.click(saveButton());
      expect(await screen.findByText(/API に接続できませんでした/)).toBeInTheDocument();

      await user.click(saveButton());

      await waitFor(() => expect(screen.queryByText(/API に接続できませんでした/)).not.toBeInTheDocument());
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  describe("閉じる", () => {
    it("「キャンセル」で、onCancel が呼ばれる", async () => {
      const user = userEvent.setup();
      const { onCancel, onSubmit } = renderForm();

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Esc キー(cancel イベント)で、onCancel が呼ばれる。ブラウザ標準の閉じ方は、止める", () => {
      const { onCancel } = renderForm();

      const event = new Event("cancel", { cancelable: true });
      fireEvent(screen.getByRole("dialog"), event);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it("ダイアログの外側(暗い背景)のクリックで、onCancel が呼ばれる", async () => {
      const user = userEvent.setup();
      const { onCancel } = renderForm();

      await user.click(screen.getByRole("dialog")); // ダイアログの箱そのものを押す = 背景のクリック

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("フォームの中身のクリックでは、閉じない", async () => {
      const user = userEvent.setup();
      const { onCancel } = renderForm();

      await user.click(nameInput());
      await user.click(screen.getByRole("heading", { name: HEADING }));

      expect(onCancel).not.toHaveBeenCalled();
    });

    it("保存中は、Esc や背景のクリックでは、閉じない", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockImplementation(() => new Promise<void>(() => {})); // 終わらない保存
      const { onCancel } = renderForm({ onSubmit });
      await user.type(nameInput(), "クレーム対応");
      await user.click(saveButton());

      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      await user.click(screen.getByRole("dialog"));

      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});

describe("SkillForm(編集フォーム)", () => {
  const initial = { name: "請求書の発行", note: "締め日に注意", priority: "high", dueDate: "2026-10-31" };

  it("最初の値(initial)が、入力欄に入った状態で開く", () => {
    renderForm({ heading: "スキルを編集", initial });

    expect(screen.getByRole("dialog", { name: "スキルを編集" })).toBeInTheDocument();
    expect(nameInput()).toHaveValue("請求書の発行");
    expect(screen.getByLabelText("優先度")).toHaveValue("high");
    expect(screen.getByLabelText("期限")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("ポイント・考察")).toHaveValue("締め日に注意");
  });

  it("値を変えて保存すると、変えた内容を、onSubmit に渡す", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({ initial });

    await user.type(nameInput(), "(改)");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith({ ...initial, name: "請求書の発行(改)" });
  });

  it("習得日(readonlyAcquiredOn)を渡すと、表示のみで出す。入力欄ではない", () => {
    renderForm({ initial, readonlyAcquiredOn: "2026-09-01" });

    expect(screen.getByText("習得日: 2026-09-01(自動で記録されるため、編集できません)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/習得日/)).not.toBeInTheDocument();
  });

  it("習得日を渡さなければ、習得日は出さない", () => {
    renderForm({ initial });

    expect(screen.queryByText(/習得日/)).not.toBeInTheDocument();
  });

  it("別のスキルの値で開き直すと、前の入力は残らず、新しい最初の値になる", async () => {
    const user = userEvent.setup();
    const { rerender, onSubmit, onCancel } = renderForm({ initial });
    await user.type(nameInput(), "(書きかけ)");

    rerender(<SkillForm open={false} heading="スキルを編集" onSubmit={onSubmit} onCancel={onCancel} />);
    rerender(
      <SkillForm open heading="スキルを編集" initial={{ ...initial, name: "別のスキル" }} onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(nameInput()).toHaveValue("別のスキル");
  });
});
