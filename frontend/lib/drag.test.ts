import { describe, expect, it } from "vitest";
import { moveSkill } from "@/lib/board";
import {
  buildAnnouncements,
  columnDropId,
  columnsFromItems,
  currentPosition,
  findStatus,
  isBelow,
  itemsFromSkills,
  moveOver,
  resolveDrop,
  SCREEN_READER_INSTRUCTIONS,
  statusFromColumnDropId,
  type ColumnItems,
} from "@/lib/drag";
import { makeSkill, sampleSkills } from "@/lib/fixtures";
import { STATUSES } from "@/lib/types";

// サンプル: 未習得 [1, 2, 3]、習得中 [4, 5]、習得済み [6]
const items = (): ColumnItems => itemsFromSkills(sampleSkills());

// 書き換えを見つけるため、渡す並びを、書き換え禁止にする
function frozenItems(source: ColumnItems): ColumnItems {
  return {
    unlearned: Object.freeze([...source.unlearned]) as number[],
    learning: Object.freeze([...source.learning]) as number[],
    mastered: Object.freeze([...source.mastered]) as number[],
  };
}

describe("列の、ドロップ先としての id", () => {
  it("列の id を作り、そこから状態に戻せる", () => {
    for (const status of STATUSES) {
      expect(statusFromColumnDropId(columnDropId(status))).toBe(status);
    }
    expect(columnDropId("learning")).toBe("column:learning");
  });

  it("カードの id(数字)や、決まった形でない文字列は、列の id ではない", () => {
    expect(statusFromColumnDropId(3)).toBeNull();
    expect(statusFromColumnDropId("3")).toBeNull();
    expect(statusFromColumnDropId("column:bogus")).toBeNull();
    expect(statusFromColumnDropId("learning")).toBeNull();
    expect(statusFromColumnDropId("")).toBeNull();
  });
});

describe("並びの作成と検索", () => {
  it("itemsFromSkills: 状態ごとに、並び順の順の id を作る(配列の順番には、頼らない)", () => {
    const shuffled = [
      makeSkill({ id: 3, status: "unlearned", position: 2 }),
      makeSkill({ id: 1, status: "unlearned", position: 0 }),
      makeSkill({ id: 5, status: "mastered", acquiredOn: "2026-09-01", position: 0 }),
      makeSkill({ id: 2, status: "unlearned", position: 1 }),
    ];

    expect(itemsFromSkills(shuffled)).toEqual({ unlearned: [1, 2, 3], learning: [], mastered: [5] });
    expect(items()).toEqual({ unlearned: [1, 2, 3], learning: [4, 5], mastered: [6] });
  });

  it("findStatus: カードが、いまどの列にあるか。なければ null", () => {
    expect(findStatus(items(), 2)).toBe("unlearned");
    expect(findStatus(items(), 5)).toBe("learning");
    expect(findStatus(items(), 6)).toBe("mastered");
    expect(findStatus(items(), 999)).toBeNull();
  });

  it("currentPosition: スキルの、いまの(列, 位置)", () => {
    expect(currentPosition(sampleSkills(), 3)).toEqual({ status: "unlearned", index: 2 });
    expect(currentPosition(sampleSkills(), 4)).toEqual({ status: "learning", index: 0 });
    expect(currentPosition(sampleSkills(), 999)).toBeNull();
  });

  it("columnsFromItems: 並び(id)から、画面に出すスキルの並びを作る。見つからない id は、飛ばす", () => {
    const columns = columnsFromItems(sampleSkills(), { unlearned: [3, 999, 1], learning: [], mastered: [6] });

    expect(columns.unlearned.map((s) => s.id)).toEqual([3, 1]);
    expect(columns.learning).toEqual([]);
    expect(columns.mastered.map((s) => s.id)).toEqual([6]);
  });
});

describe("isBelow(重なっているカードの、真ん中より下か)", () => {
  it("ドラッグ中のカードの上端が、相手の真ん中より下なら true", () => {
    const over = { top: 100, height: 80 }; // 真ん中は 140
    expect(isBelow({ top: 141 }, over)).toBe(true);
    expect(isBelow({ top: 140 }, over)).toBe(false);
    expect(isBelow({ top: 90 }, over)).toBe(false);
  });
});

describe("moveOver(ドラッグ中の、一時的な並び)", () => {
  it("別の列のカードの上に来たら、その前に入る。元の列からは、外れる", () => {
    const result = moveOver(items(), 2, 4, false); // 未習得の 2 が、習得中の 4 の上(上半分)

    expect(result).toEqual({ unlearned: [1, 3], learning: [2, 4, 5], mastered: [6] });
  });

  it("相手の真ん中より下(isBelowOver)なら、その後ろに入る", () => {
    expect(moveOver(items(), 2, 4, true).learning).toEqual([4, 2, 5]);
    expect(moveOver(items(), 2, 5, true).learning).toEqual([4, 5, 2]);
  });

  it("列そのものの上に来たら、その列の末尾に入る", () => {
    expect(moveOver(items(), 2, columnDropId("learning"), false).learning).toEqual([4, 5, 2]);
    expect(moveOver(items(), 2, columnDropId("learning"), true).learning).toEqual([4, 5, 2]); // 列の上では、位置の上下は関係ない
  });

  it("空の列の上に来たら、そのカードだけが入る。元の列が空になってもよい", () => {
    const start: ColumnItems = { unlearned: [1], learning: [], mastered: [] };

    expect(moveOver(start, 1, columnDropId("mastered"), false)).toEqual({ unlearned: [], learning: [], mastered: [1] });
  });

  it("どの列からどの列へでも移れる(習得済み → 未習得)", () => {
    expect(moveOver(items(), 6, 2, false)).toEqual({ unlearned: [1, 6, 2, 3], learning: [4, 5], mastered: [] });
  });

  it("同じ列の中では、何も変えない(同じ並びをそのまま返す)。並び替えの見た目は、@dnd-kit/sortable が動かす", () => {
    const before = items();

    expect(moveOver(before, 1, 3, true)).toBe(before);
    expect(moveOver(before, 1, columnDropId("unlearned"), false)).toBe(before);
    expect(moveOver(before, 1, 1, false)).toBe(before);
  });

  it("不明な id のときは、何も変えない", () => {
    const before = items();

    expect(moveOver(before, 999, 4, false)).toBe(before); // ドラッグ中のカードが、不明
    expect(moveOver(before, 2, 999, false)).toBe(before); // 落とす先が、不明
    expect(moveOver(before, 2, "column:bogus", false)).toBe(before);
  });

  it("渡した並びを書き換えない。ほかの列は、同じ配列のまま", () => {
    const before = frozenItems(items());

    const result = moveOver(before, 2, 4, false);

    expect(before.unlearned).toEqual([1, 2, 3]);
    expect(result.mastered).toBe(before.mastered);
  });

  it("行ったり来たりしても、カードは、いつも1つの列にだけある", () => {
    let current = items();
    current = moveOver(current, 2, 4, false);
    current = moveOver(current, 2, columnDropId("mastered"), false);
    current = moveOver(current, 2, 1, false);

    expect(current).toEqual({ unlearned: [2, 1, 3], learning: [4, 5], mastered: [6] });
    expect([...current.unlearned, ...current.learning, ...current.mastered].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("resolveDrop(手を離したときの、最終的な移動先)", () => {
  it("同じ列の中: 落とした場所のカードの位置になる(下へ動かす)", () => {
    expect(resolveDrop(items(), 1, 3)).toEqual({ status: "unlearned", index: 2 });
    expect(resolveDrop(items(), 1, 2)).toEqual({ status: "unlearned", index: 1 });
  });

  it("同じ列の中: 落とした場所のカードの位置になる(上へ動かす)", () => {
    expect(resolveDrop(items(), 3, 1)).toEqual({ status: "unlearned", index: 0 });
    expect(resolveDrop(items(), 3, 2)).toEqual({ status: "unlearned", index: 1 });
  });

  it("自分自身の上に落とすと、いまの位置のまま", () => {
    expect(resolveDrop(items(), 2, 2)).toEqual({ status: "unlearned", index: 1 });
  });

  it("同じ列そのものの上に落とすと、末尾になる", () => {
    expect(resolveDrop(items(), 1, columnDropId("unlearned"))).toEqual({ status: "unlearned", index: 2 });
  });

  it("ドラッグ中に、別の列へ移っていた場合(moveOver の結果): 移った先の、その位置になる", () => {
    const dragging = moveOver(items(), 2, 4, false); // 習得中 [2, 4, 5]

    expect(resolveDrop(dragging, 2, 2)).toEqual({ status: "learning", index: 0 }); // 自分自身の上で、手を離した
    expect(resolveDrop(dragging, 2, 4)).toEqual({ status: "learning", index: 1 }); // 隣のカードの上で、手を離した
  });

  it("移っていない別の列の上に落とした場合(キーボード操作の途中など): その列の、落とした場所", () => {
    expect(resolveDrop(items(), 2, 5)).toEqual({ status: "learning", index: 1 });
    expect(resolveDrop(items(), 2, columnDropId("learning"))).toEqual({ status: "learning", index: 2 });
    expect(resolveDrop({ unlearned: [1], learning: [], mastered: [] }, 1, columnDropId("mastered"))).toEqual({ status: "mastered", index: 0 });
  });

  it("ドラッグしたカードや、落とした場所が分からないときは、null(何もしない)", () => {
    expect(resolveDrop(items(), 999, 1)).toBeNull();
    expect(resolveDrop(items(), 1, 999)).toBeNull();
    expect(resolveDrop(items(), 1, "column:bogus")).toBeNull();
  });
});

// ---------- 大事な確認: ドラッグ中に見えていた並びと、実際に移動した結果が、一致するか ----------

// 同じ列の中の、並び替えの見た目(@dnd-kit/sortable の arrayMove と同じ)
function arrayMove(list: number[], from: number, to: number): number[] {
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

describe("ドラッグ中の見た目と、移動の結果の一致", () => {
  it("ランダムな、ドラッグの途中経過と、手を離す場所で、500回試しても、見た目の並びと、moveSkill の結果が、同じになる", () => {
    let seed = 2026;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };
    const today = "2026-09-20";

    for (let trial = 0; trial < 500; trial++) {
      const skills = sampleSkills();
      const activeId = skills[random(skills.length)].id;
      let visual = itemsFromSkills(skills);

      // ドラッグ中に、いろいろな場所の上を通る(カードの上・列の上。上半分・下半分)
      const passes = random(5);
      for (let i = 0; i < passes; i++) {
        const overId = random(3) === 0 ? columnDropId(STATUSES[random(3)]) : skills[random(skills.length)].id;
        visual = moveOver(visual, activeId, overId, random(2) === 0);
      }

      // 最後に、どこかで手を離す
      const dropId = random(4) === 0 ? columnDropId(STATUSES[random(3)]) : skills[random(skills.length)].id;
      const target = resolveDrop(visual, activeId, dropId);
      expect(target).not.toBeNull();

      // 手を離した時点の、見た目の並び(同じ列の中なら、arrayMove で並び替える)
      const from = findStatus(visual, activeId)!;
      const shown = { ...visual };
      const dropStatus = typeof dropId === "number" ? findStatus(visual, dropId)! : statusFromColumnDropId(dropId)!;
      if (from === dropStatus) {
        const list = visual[from];
        shown[from] = arrayMove(list, list.indexOf(activeId), typeof dropId === "number" ? list.indexOf(dropId) : list.length - 1);
      }

      // 実際の移動(moveSkill)の結果と、同じ並びになるか(別の列に移っていない場合は、移動先の列に、その位置で入る)
      const moved = itemsFromSkills(moveSkill(skills, activeId, target!.status, target!.index, today));
      if (from === dropStatus) {
        expect(moved, `試行 ${trial}: 見た目と、移動の結果が、食い違った`).toEqual(shown);
      } else {
        expect(moved[target!.status].indexOf(activeId), `試行 ${trial}`).toBe(target!.index);
      }
    }
  });
});

describe("buildAnnouncements(読み上げの文言)", () => {
  const skills = sampleSkills();
  const announce = buildAnnouncements(skills);

  it("つかんだとき、スキルの名前を読み上げる", () => {
    expect(announce.onDragStart({ active: { id: 2 } })).toBe("「発注書の確認」をつかみました。");
  });

  it("カードの上に動かしたとき、そのカードの名前を読み上げる。列の上なら、列の名前", () => {
    expect(announce.onDragOver({ active: { id: 2 }, over: { id: 4 } })).toBe("「発注書の確認」を、「請求書の発行」の位置の上に動かしています。");
    expect(announce.onDragOver({ active: { id: 2 }, over: { id: columnDropId("mastered") } })).toBe("「発注書の確認」を、「習得済み」の列の上に動かしています。");
  });

  it("置ける場所の外にあるとき、そう伝える", () => {
    expect(announce.onDragOver({ active: { id: 2 }, over: null })).toBe("「発注書の確認」は、置ける場所の外にあります。");
  });

  it("置いたとき、置き場所を読み上げる。場所の外で置いたら、元の位置に戻したと伝える", () => {
    expect(announce.onDragEnd({ active: { id: 2 }, over: { id: columnDropId("learning") } })).toBe("「発注書の確認」を、「習得中」の列に置きました。");
    expect(announce.onDragEnd({ active: { id: 2 }, over: null })).toBe("「発注書の確認」を、元の位置に戻しました。");
  });

  it("やめたとき、そう伝える", () => {
    expect(announce.onDragCancel({ active: { id: 2 } })).toBe("「発注書の確認」の移動を、やめました。元の位置に戻しました。");
  });

  it("名前が分からないスキル・場所でも、壊れない", () => {
    expect(announce.onDragStart({ active: { id: 999 } })).toBe("「スキル」をつかみました。");
    expect(announce.onDragOver({ active: { id: 2 }, over: { id: 999 } })).toContain("その場所");
  });

  it("操作の説明(スクリーンリーダー向け)は、日本語で、つかむ・動かす・置く・やめる操作を伝える", () => {
    expect(SCREEN_READER_INSTRUCTIONS).toContain("スペース");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("矢印");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("Esc");
  });
});
