import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Column } from "@/components/Column";
import { makeSkill } from "@/lib/fixtures";

// SortableContext に渡された items(カードの id の並び)を、記録する
const received = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@dnd-kit/sortable", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/sortable")>("@dnd-kit/sortable");
  return {
    ...actual,
    SortableContext: (props: { items: unknown[]; children: React.ReactNode }) => {
      received.items.push(props.items);
      return props.children;
    },
  };
});

const noop = () => {};
const props = { status: "learning" as const, today: "2026-09-20", onAdd: noop, onEdit: noop, onDelete: noop, onSort: noop, sortDisabled: false, highlighted: false, dragDisabled: false };

beforeEach(() => {
  received.items = [];
});

describe("Column が、SortableContext に渡す、カードの id の並び", () => {
  it("カードの id が、画面の順に、並んでいる", () => {
    render(<Column {...props} skills={[makeSkill({ id: 5 }), makeSkill({ id: 3 })]} />);

    expect(received.items.at(-1)).toEqual([5, 3]);
  });

  it("スキルが 0 件なら、空の並び", () => {
    render(<Column {...props} skills={[]} />);

    expect(received.items.at(-1)).toEqual([]);
  });

  // @dnd-kit は、渡された配列が「前と違うか」で、位置を測り直す。描画のたびに新しい配列を渡すと、
  // 測り直し → 再描画 → 新しい配列 → 測り直し…と、際限なく繰り返して、「Maximum update depth exceeded」で画面が壊れる。
  it("再描画しても、中身が同じなら、同じ配列を渡す(測り直しの繰り返しを防ぐ)", () => {
    const { rerender } = render(<Column {...props} skills={[makeSkill({ id: 5 }), makeSkill({ id: 3 })]} />);
    const first = received.items.at(-1);

    // 別の配列(スキルの中身も、別のオブジェクト)で、再描画する。id の並びは、同じ
    rerender(<Column {...props} skills={[makeSkill({ id: 5, name: "変えた" }), makeSkill({ id: 3 })]} />);
    rerender(<Column {...props} skills={[makeSkill({ id: 5 }), makeSkill({ id: 3 })]} highlighted />);

    expect(received.items.length).toBeGreaterThanOrEqual(3);
    for (const items of received.items) expect(items).toBe(first);
  });

  it("id の並びが変われば、新しい配列を渡す(カードが増える・減る・入れ替わる)", () => {
    const { rerender } = render(<Column {...props} skills={[makeSkill({ id: 5 }), makeSkill({ id: 3 })]} />);

    rerender(<Column {...props} skills={[makeSkill({ id: 5 }), makeSkill({ id: 3 }), makeSkill({ id: 8 })]} />);
    expect(received.items.at(-1)).toEqual([5, 3, 8]);

    rerender(<Column {...props} skills={[makeSkill({ id: 3 }), makeSkill({ id: 5 }), makeSkill({ id: 8 })]} />);
    expect(received.items.at(-1)).toEqual([3, 5, 8]);

    rerender(<Column {...props} skills={[]} />);
    expect(received.items.at(-1)).toEqual([]);
  });
});
