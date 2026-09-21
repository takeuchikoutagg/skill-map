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
  const onTarget: { current: boolean | null } = { current: null }; // 直近の判定で、カーソル(またはコピー)が、実際に何かの上にあったか
  const options = {
    getItems: () => items,
    getLastOverId: () => lastOverId.current,
    setLastOverId: (id: UniqueIdentifier | null) => {
      lastOverId.current = id;
    },
    setOnTarget: (value: boolean) => {
      onTarget.current = value;
    },
  };
  const detect = (args: Args) => detectCollisions(args, options);
  return { detect, lastOverId, onTarget };
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

  // 実際のブラウザで、画面が壊れた不具合(Maximum update depth exceeded)の再現。
  // カーソルが、列と列のすき間にあると、「カーソルの下」には何もない。そこで、コピーのカードが重なっている面積で決める
  // 予備の判定に頼ると、カードが列を移るたびに、レイアウトが変わって、行き先が、2つの列の間で行き来して、止まらなくなる。
  // カーソルの位置が分かっているときは、すき間では、直前の行き先を保つ。
  describe("カーソルが、列と列のすき間にあるとき", () => {
    // すき間(x = 300〜320)の中のカーソル。ドラッグ中のカードは、習得中の列に、より多く重なっている
    const inGap = () => makeArgs({ x: 310, y: 100 }, rect(305, 60, 100, 80));

    it("コピーが、隣の列のカードに重なっていても、そちらへは切り替えず、直前の行き先を保つ", () => {
      const { detect } = detector();
      detect(makeArgs({ x: 100, y: 180 }, rect(90, 170, 20, 20))); // まず、未習得のカード 2 の上

      expect(detect(inGap())).toEqual([{ id: 2 }]);
    });

    it("直前の行き先がなければ、何も選ばない(重なりの面積では、選ばない)", () => {
      const { detect } = detector();

      expect(detect(inGap())).toEqual([]);
    });

    it("何度、判定しても、同じ結果(行き来しない)", () => {
      const { detect } = detector();
      detect(makeArgs({ x: 400, y: 90 }, rect(390, 80, 20, 20))); // 習得中のカード 4 の上

      for (let i = 0; i < 5; i++) expect(detect(inGap())).toEqual([{ id: 4 }]);
    });
  });

  describe("「いま、何かの上にあるか」の記録(手を離したときに、列の外かどうかを知るため)", () => {
    it("カーソルが、カードの上にあれば、「上にある」", () => {
      const { detect, onTarget } = detector();

      detect(makeArgs({ x: 100, y: 180 }, rect(90, 170, 20, 20)));

      expect(onTarget.current).toBe(true);
    });

    it("カーソルが、列の余白・空の列の上にあっても、「上にある」", () => {
      const { detect, onTarget } = detector();

      detect(makeArgs({ x: 150, y: 330 }, rect(140, 320, 20, 20)));
      expect(onTarget.current).toBe(true);
      detect(makeArgs({ x: 780, y: 200 }, rect(770, 190, 20, 20)));
      expect(onTarget.current).toBe(true);
    });

    it("列と列のすき間・列の外では、直前の行き先を返す(ちらつき防止)が、「上にない」と記録する", () => {
      const { detect, onTarget } = detector();
      detect(makeArgs({ x: 100, y: 180 }, rect(90, 170, 20, 20)));

      expect(detect(makeArgs({ x: 310, y: 100 }, rect(305, 60, 100, 80)))).toEqual([{ id: 2 }]); // すき間
      expect(onTarget.current).toBe(false);
      expect(detect(makeArgs({ x: 2000, y: 2000 }, rect(1990, 1990, 20, 20)))).toEqual([{ id: 2 }]); // 遠く
      expect(onTarget.current).toBe(false);
    });

    it("直前の行き先もないときも、「上にない」", () => {
      const { detect, onTarget } = detector();

      detect(makeArgs({ x: 2000, y: 2000 }, rect(1990, 1990, 20, 20)));

      expect(onTarget.current).toBe(false);
    });

    it("また、何かの上に戻れば、「上にある」に戻る", () => {
      const { detect, onTarget } = detector();
      detect(makeArgs({ x: 2000, y: 2000 }, rect(1990, 1990, 20, 20)));

      detect(makeArgs({ x: 400, y: 90 }, rect(390, 80, 20, 20)));

      expect(onTarget.current).toBe(true);
    });

    it("カーソルがない(キーボード)ときは、コピーのカードが重なっていれば、「上にある」", () => {
      const { detect, onTarget } = detector();

      detect(makeArgs(null, rect(335, 60, 100, 60)));
      expect(onTarget.current).toBe(true);
      detect(makeArgs(null, rect(1990, 1990, 20, 20)));
      expect(onTarget.current).toBe(false);
    });
  });

  it("重なったものは、覚えておく(直前に重なっていたものとして)", () => {
    const { detect, lastOverId } = detector();

    detect(makeArgs({ x: 780, y: 200 }, rect(770, 190, 20, 20)));

    expect(lastOverId.current).toBe(columnDropId("mastered"));
  });
});
