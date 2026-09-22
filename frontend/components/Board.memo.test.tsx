import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { sampleSkills } from "@/lib/fixtures";
import type { Skill, Status } from "@/lib/types";

// Column に渡された skills(その列の配列)を、呼ばれるたびに、記録する。
// Column 自身にも、id の並びを安定させる仕組みがあるので、ここでは、その手前(Board から渡される、配列そのもの)を見る。
const received = vi.hoisted(() => ({ calls: [] as { status: Status; skills: Skill[] }[] }));
vi.mock("@/components/Column", async () => {
  const actual = await vi.importActual<typeof import("@/components/Column")>("@/components/Column");
  const React = await import("react");
  return {
    Column: (props: React.ComponentProps<typeof actual.Column>) => {
      received.calls.push({ status: props.status, skills: props.skills });
      return React.createElement(actual.Column, props);
    },
  };
});

const latest = (status: Status) => received.calls.filter((call) => call.status === status).at(-1)!.skills;

describe("Board: columns の、参照の安定性(useMemo)", () => {
  it("スキルの一覧が変わらない再描画(フォームの開閉など)では、Column に渡す、その列の配列が、同じ参照のまま", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today="2026-09-20" />);
    const before = latest("unlearned");

    // スキルの一覧には、関係ない状態の変化(フォームを開いて、キャンセルする)
    await user.click(screen.getAllByRole("button", { name: "+ スキルを追加" })[0]);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    const after = latest("unlearned");
    expect(after).toBe(before); // 同じ配列(中身の比較ではなく、同じもの)
  });
});
