import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillCard } from "@/components/SkillCard";
import { makeSkill } from "@/lib/fixtures";

const skill = makeSkill({ id: 5, name: "請求書の発行", note: "締め日に注意" });

function renderCard() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<SkillCard skill={skill} today="2026-09-20" onEdit={onEdit} onDelete={onDelete} />);
  return { onEdit, onDelete };
}

describe("SkillCard のクリック", () => {
  it("カードのどこをクリックしても、onEdit が(そのスキルを渡して)1回呼ばれる", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderCard();

    await user.click(screen.getByText("締め日に注意"));
    await user.click(screen.getByText("優先度: 中"));

    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit).toHaveBeenCalledWith(skill);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("スキル名のボタンを押しても、onEdit は、1回だけ呼ばれる(キーボードの Enter でも同じ)", async () => {
    const user = userEvent.setup();
    const { onEdit } = renderCard();

    await user.click(screen.getByRole("button", { name: "請求書の発行" }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "請求書の発行" }).focus();
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("「削除」を押すと、onDelete だけが呼ばれる(onEdit は、呼ばれない)", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderCard();

    await user.click(screen.getByRole("button", { name: "「請求書の発行」を削除" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(skill);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("削除ボタンの名前に、スキル名が入っている(どのスキルの削除かが、分かる)", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "「請求書の発行」を削除" })).toHaveTextContent("削除");
  });
});

describe("SkillCard: 移動・並べ替えの通信中(busy)", () => {
  it("busy のとき、カードやスキル名をクリックしても、onEdit は呼ばれない", async () => {
    const onEdit = vi.fn();
    render(<SkillCard skill={makeSkill({ id: 1, name: "レジ締め" })} today="2026-09-20" onEdit={onEdit} onDelete={vi.fn()} busy />);

    await userEvent.click(screen.getByRole("heading", { name: "レジ締め" }).closest("article")!);
    await userEvent.click(screen.getByRole("button", { name: "レジ締め" }));

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("busy のとき、削除ボタンは押せず、onDelete は呼ばれない", async () => {
    const onDelete = vi.fn();
    render(<SkillCard skill={makeSkill({ id: 1, name: "レジ締め" })} today="2026-09-20" onEdit={vi.fn()} onDelete={onDelete} busy />);

    const button = screen.getByRole("button", { name: "「レジ締め」を削除" });
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("busy でなければ(既定)、これまでどおり、編集も削除もできる", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<SkillCard skill={makeSkill({ id: 1, name: "レジ締め" })} today="2026-09-20" onEdit={onEdit} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole("button", { name: "レジ締め" }));
    await userEvent.click(screen.getByRole("button", { name: "「レジ締め」を削除" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
