import type { CollisionDetection, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { detectCollisions } from "@/lib/collision";
import { columnDropId, type ColumnItems } from "@/lib/drag";

type Args = Parameters<CollisionDetection>[0];

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

// 画面の配置(1列 300 幅、列の間 20):
//   未習得の列(0,0)〜(300,400): カード 1 (10,50)、カード 2 (10,140)
//   習得中の列(320,0)〜(620,400): カード 4 (330,50)
//   習得済みの列(640,0)〜(940,400): 空
const RECTS: [UniqueIdentifier, ReturnType<typeof rect>][] = [
  [columnDropId("unlearned"), rect(0, 0, 300, 400)],
  [1, rect(10, 50, 280, 80)],
  [2, rect(10, 140, 280, 80)],
  [columnDropId("learning"), rect(320, 0, 300, 400)],
  [4, rect(330, 50, 280, 80)],
  [columnDropId("mastered"), rect(640, 0, 300, 400)],
];

const ITEMS: ColumnItems = { unlearned: [1, 2], learning: [4], mastered: [] };

// @dnd-kit に渡される引数を、まねて作る。pointer: カーソルの位置。dragged: ドラッグ中のカードの四角
function makeArgs(pointer: { x: number; y: number } | null, dragged: ReturnType<typeof rect>): Args {
  return {
    active: { id: 99 },
    collisionRect: dragged,
    droppableRects: new Map(RECTS),
    droppableContainers: RECTS.map(([id, r]) => ({ id, key: id, disabled: false, data: { current: undefined }, node: { current: null }, rect: { current: r } })),
    pointerCoordinates: pointer,
  } as unknown as Args;
}

function detector(items: ColumnItems | null = ITEMS) {
  const lastOverId: { current: UniqueIdentifier | null } = { current: null };
  const options = {
    getItems: () => items,
    getLastOverId: () => lastOverId.current,
    setLastOverId: (id: UniqueIdentifier | null) => {
      lastOverId.current = id;
    },
  };
  const detect = (args: Args) => detectCollisions(args, options);
  return { detect, lastOverId };
}

describe("detectCollisions", () => {
  it("カーソルが、カードの上にあれば、そのカードを選ぶ", () => {
    const { detect } = detector();

    expect(detect(makeArgs({ x: 100, y: 180 }, rect(90, 170, 20, 20)))).toEqual([{ id: 2 }]);
    expect(detect(makeArgs({ x: 400, y: 90 }, rect(390, 80, 20, 20)))).toEqual([{ id: 4 }]);
  });

  it("カードのある列の、余白の上にあるときは、その列の、いちばん近いカードを選ぶ", () => {
    const { detect } = detector();

    // 未習得の列の、下の余白(カード 2 の下)。ドラッグ中のカードは、カード 2 の近く
    expect(detect(makeArgs({ x: 150, y: 330 }, rect(140, 320, 20, 20)))).toEqual([{ id: 2 }]);
    // 未習得の列の、上の余白(カード 1 の上)
    expect(detect(makeArgs({ x: 150, y: 10 }, rect(140, 0, 20, 20)))).toEqual([{ id: 1 }]);
  });

  it("列の余白の上では、隣の列のカードのほうが近くても、その列のカードから選ぶ", () => {
    const { detect } = detector();

    // 習得中の列の、左下の余白。ドラッグ中のカードの中心から見て、未習得のカード 2 のほうが、習得中のカード 4 より近い
    expect(detect(makeArgs({ x: 330, y: 310 }, rect(322, 300, 20, 20)))).toEqual([{ id: 4 }]);
  });

  it("空の列の上にあるときは、その列そのものを選ぶ", () => {
    const { detect } = detector();

    expect(detect(makeArgs({ x: 780, y: 200 }, rect(770, 190, 20, 20)))).toEqual([{ id: columnDropId("mastered") }]);
  });

  it("ドラッグ中でない(並びが分からない)ときは、列そのものを選ぶ", () => {
    const { detect } = detector(null);

    expect(detect(makeArgs({ x: 150, y: 330 }, rect(140, 320, 20, 20)))).toEqual([{ id: columnDropId("unlearned") }]);
  });

  it("カーソルの位置が分からないときは、ドラッグ中のカードと重なっているものを選ぶ", () => {
    const { detect } = detector();

    expect(detect(makeArgs(null, rect(335, 60, 100, 60)))).toEqual([{ id: 4 }]);
  });

  it("どこにも重なっていないときは、直前に重なっていたものを使う(ちらつきを防ぐ)", () => {
    const { detect, lastOverId } = detector();
    detect(makeArgs({ x: 100, y: 180 }, rect(90, 170, 20, 20))); // まず、カード 2 の上
    expect(lastOverId.current).toBe(2);

    expect(detect(makeArgs({ x: 2000, y: 2000 }, rect(1990, 1990, 20, 20)))).toEqual([{ id: 2 }]);
  });

  it("どこにも重なっていなくて、直前の記録もないときは、何も選ばない", () => {
    const { detect } = detector();

    expect(detect(makeArgs({ x: 2000, y: 2000 }, rect(1990, 1990, 20, 20)))).toEqual([]);
  });

  it("重なったものは、覚えておく(直前に重なっていたものとして)", () => {
    const { detect, lastOverId } = detector();

    detect(makeArgs({ x: 780, y: 200 }, rect(770, 190, 20, 20)));

    expect(lastOverId.current).toBe(columnDropId("mastered"));
  });
});
