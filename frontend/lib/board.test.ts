import { describe, expect, it } from "vitest";
import {
  groupByStatus,
  isOverdue,
  moveSkill,
  removeSkill,
  replaceSkill,
  skillsInStatus,
  sortByPriority,
  todayInTokyo,
  validateSkillInput,
  type SkillInput,
} from "@/lib/board";
import { makeSkill, sampleSkills } from "@/lib/fixtures";
import { STATUSES, type Skill, type Status } from "@/lib/types";

const TODAY = "2026-09-20";

// ある状態の、並び順の順の id
const ids = (skills: Skill[], status: Status) => skillsInStatus(skills, status).map((skill) => skill.id);
// ある状態の、並び順の順の [id, 並び順]
const positions = (skills: Skill[], status: Status) => skillsInStatus(skills, status).map((s) => [s.id, s.position]);
const get = (skills: Skill[], id: number) => skills.find((skill) => skill.id === id)!;

// 書き換えを見つけるため、渡す配列を、書き換え禁止にする
function frozen(skills: Skill[]): Skill[] {
  return skills.map((skill) => Object.freeze({ ...skill }));
}

describe("skillsInStatus / groupByStatus", () => {
  it("状態ごとに分けて、並び順の順に並べる(配列の順番には、頼らない)", () => {
    const shuffled = [
      makeSkill({ id: 3, status: "unlearned", position: 2 }),
      makeSkill({ id: 1, status: "unlearned", position: 0 }),
      makeSkill({ id: 5, status: "mastered", acquiredOn: TODAY, position: 0 }),
      makeSkill({ id: 2, status: "unlearned", position: 1 }),
      makeSkill({ id: 4, status: "learning", position: 0 }),
    ];

    const groups = groupByStatus(shuffled);

    expect(groups.unlearned.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(groups.learning.map((s) => s.id)).toEqual([4]);
    expect(groups.mastered.map((s) => s.id)).toEqual([5]);
  });

  it("並び順が同じときは、id の順", () => {
    const skills = [makeSkill({ id: 9, position: 0 }), makeSkill({ id: 4, position: 0 })];

    expect(ids(skills, "unlearned")).toEqual([4, 9]);
  });

  it("スキルがない状態は、空の配列", () => {
    expect(groupByStatus([])).toEqual({ unlearned: [], learning: [], mastered: [] });
  });

  it("元の配列を書き換えない", () => {
    const skills = frozen(sampleSkills());

    expect(() => groupByStatus(skills)).not.toThrow();
  });
});

describe("isOverdue(期限切れ)", () => {
  it("期限が今日より前で、習得済みでなければ、期限切れ", () => {
    expect(isOverdue(makeSkill({ id: 1, dueDate: "2026-09-19" }), TODAY)).toBe(true);
    expect(isOverdue(makeSkill({ id: 1, status: "learning", dueDate: "2026-09-19" }), TODAY)).toBe(true);
  });

  it("習得済みは、期限が過ぎていても、期限切れにならない", () => {
    expect(isOverdue(makeSkill({ id: 1, status: "mastered", dueDate: "2026-09-10", acquiredOn: TODAY }), TODAY)).toBe(false);
  });

  it("期限がなければ、期限切れではない", () => {
    expect(isOverdue(makeSkill({ id: 1, dueDate: null }), TODAY)).toBe(false);
  });

  it("期限が今日、または、これから、なら、期限切れではない", () => {
    expect(isOverdue(makeSkill({ id: 1, dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(makeSkill({ id: 1, dueDate: "2026-09-21" }), TODAY)).toBe(false);
  });
});

describe("todayInTokyo(日本時間の今日)", () => {
  it("UTC の 15:00 は、日本では翌日の 0:00", () => {
    expect(todayInTokyo(new Date(Date.UTC(2026, 8, 19, 15, 0, 0)))).toBe("2026-09-20");
  });

  it("UTC の 14:59 は、日本では、まだその日", () => {
    expect(todayInTokyo(new Date(Date.UTC(2026, 8, 19, 14, 59, 0)))).toBe("2026-09-19");
  });

  it("引数を省略すると、今の日付を、YYYY-MM-DD で返す", () => {
    expect(todayInTokyo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("validateSkillInput(入力チェック。バックエンドと同じ規則)", () => {
  const valid: SkillInput = { name: "レジ締め", note: "", priority: "medium", dueDate: "" };
  const check = (overrides: Partial<SkillInput>) => validateSkillInput({ ...valid, ...overrides });

  it("問題がなければ、空のオブジェクト", () => {
    expect(check({})).toEqual({});
  });

  it("スキル名が、空・空白だけ(全角スペースも)だとエラー", () => {
    expect(check({ name: "" }).name).toBeDefined();
    expect(check({ name: "   " }).name).toBeDefined();
    expect(check({ name: "　　" }).name).toBeDefined();
  });

  it("スキル名は、100文字まで(101文字はエラー)", () => {
    expect(check({ name: "あ".repeat(100) }).name).toBeUndefined();
    expect(check({ name: "あ".repeat(101) }).name).toBe("スキル名は100文字以内で入力してください。");
  });

  it("スキル名の前後の空白は、文字数に数えない", () => {
    expect(check({ name: `　${"あ".repeat(100)} ` }).name).toBeUndefined();
  });

  it("ポイント・考察は、5,000文字まで(5,001文字はエラー)", () => {
    expect(check({ note: "あ".repeat(5000) }).note).toBeUndefined();
    expect(check({ note: "あ".repeat(5001) }).note).toBe("ポイント・考察は5,000文字以内で入力してください。");
  });

  it("優先度は、high・medium・low のどれか", () => {
    expect(check({ priority: "high" }).priority).toBeUndefined();
    expect(check({ priority: "urgent" }).priority).toBeDefined();
    expect(check({ priority: "" }).priority).toBeDefined();
  });

  it("期限は、空、または、YYYY-MM-DD の形", () => {
    expect(check({ dueDate: "" }).dueDate).toBeUndefined();
    expect(check({ dueDate: "2026-10-31" }).dueDate).toBeUndefined();
    expect(check({ dueDate: "10/31" }).dueDate).toBeDefined();
    expect(check({ dueDate: "2026-1-5" }).dueDate).toBeDefined();
  });

  it("複数の項目が正しくないときは、項目ごとに返す", () => {
    expect(Object.keys(check({ name: "", priority: "x", dueDate: "abc" })).sort()).toEqual(["dueDate", "name", "priority"]);
  });
});

describe("moveSkill(移動)", () => {
  describe("習得日の自動記録", () => {
    it("未習得 → 習得済み: 今日が記録される(習得中を飛ばしてもよい)", () => {
      const result = moveSkill(sampleSkills(), 1, "mastered", 0, TODAY);

      expect(get(result, 1)).toMatchObject({ status: "mastered", acquiredOn: TODAY });
      expect(ids(result, "mastered")).toEqual([1, 6]);
    });

    it("習得中 → 習得済み(末尾): 今日が記録される", () => {
      const result = moveSkill(sampleSkills(), 4, "mastered", 99, TODAY);

      expect(get(result, 4).acquiredOn).toBe(TODAY);
      expect(ids(result, "mastered")).toEqual([6, 4]);
    });

    it("習得済み → 他の列: 習得日が消える(確認なし)", () => {
      const result = moveSkill(sampleSkills(), 6, "unlearned", 0, TODAY);

      expect(get(result, 6)).toMatchObject({ status: "unlearned", acquiredOn: null });
    });

    it("習得済みに戻したあと、もう一度習得済みへ移すと、新しい日付で記録し直す", () => {
      let result = moveSkill(sampleSkills(), 6, "learning", 0, "2026-09-10");
      result = moveSkill(result, 6, "mastered", 0, "2026-09-15");

      expect(get(result, 6).acquiredOn).toBe("2026-09-15");
    });

    it("習得済みの中の並び替え: 習得日は変わらない", () => {
      let result = moveSkill(sampleSkills(), 1, "mastered", 1, TODAY); // 習得済みは、[6, 1]
      result = moveSkill(result, 6, "mastered", 99, "2030-01-01"); // 6 を末尾へ

      expect(ids(result, "mastered")).toEqual([1, 6]);
      expect(get(result, 6).acquiredOn).toBe("2026-09-01");
      expect(get(result, 1).acquiredOn).toBe(TODAY);
    });

    it("未習得 ⇄ 習得中の移動: 習得日は空のまま", () => {
      const result = moveSkill(sampleSkills(), 1, "learning", 1, TODAY);

      expect(get(result, 1).acquiredOn).toBeNull();
      expect(ids(result, "learning")).toEqual([4, 1, 5]);
    });
  });

  describe("並び順(移動元・移動先の両方を、0 から連番にする)", () => {
    it("列内の並び替え(先頭・中・末尾。位置は、移動するスキルを除いて数える)", () => {
      expect(ids(moveSkill(sampleSkills(), 3, "unlearned", 0, TODAY), "unlearned")).toEqual([3, 1, 2]);
      expect(ids(moveSkill(sampleSkills(), 1, "unlearned", 1, TODAY), "unlearned")).toEqual([2, 1, 3]);
      expect(ids(moveSkill(sampleSkills(), 1, "unlearned", 2, TODAY), "unlearned")).toEqual([2, 3, 1]);
    });

    it("列の長さより大きい位置は末尾、負の位置は先頭", () => {
      expect(ids(moveSkill(sampleSkills(), 1, "unlearned", 99, TODAY), "unlearned")).toEqual([2, 3, 1]);
      expect(ids(moveSkill(sampleSkills(), 3, "unlearned", -5, TODAY), "unlearned")).toEqual([3, 1, 2]);
    });

    it("バックエンドと同じ例: A B C D の A を、位置 2 へ動かすと B C A D", () => {
      const abcd = ["A", "B", "C", "D"].map((name, i) => makeSkill({ id: i + 1, name, position: i }));

      const result = moveSkill(abcd, 1, "unlearned", 2, TODAY);

      expect(positions(result, "unlearned")).toEqual([[2, 0], [3, 1], [1, 2], [4, 3]]);
    });

    it("列間の移動: 移動先は後ろにずれ、移動元は詰まる。どちらも 0 からの連番", () => {
      const result = moveSkill(sampleSkills(), 2, "learning", 0, TODAY); // 未習得の 2 を、習得中の先頭へ

      expect(positions(result, "learning")).toEqual([[2, 0], [4, 1], [5, 2]]);
      expect(positions(result, "unlearned")).toEqual([[1, 0], [3, 1]]);
    });

    it("同じ位置を指定しても、何も変わらない", () => {
      const before = sampleSkills();

      const result = moveSkill(before, 2, "unlearned", 1, TODAY);

      expect(result).toEqual(before);
    });

    it("空の列へ移動できる。移動元が空になってもよい", () => {
      let result = moveSkill(sampleSkills(), 6, "learning", 0, TODAY); // 習得済みが空になる
      expect(ids(result, "mastered")).toEqual([]);

      result = moveSkill(result, 1, "mastered", 0, TODAY); // 空の習得済みへ
      expect(positions(result, "mastered")).toEqual([[1, 0]]);
    });

    it("どの列からどの列へでも移動できる(習得済み → 未習得の途中)", () => {
      const result = moveSkill(sampleSkills(), 6, "unlearned", 1, TODAY);

      expect(ids(result, "unlearned")).toEqual([1, 6, 2, 3]);
      expect(ids(result, "mastered")).toEqual([]);
    });
  });

  describe("そのほか", () => {
    it("ほかの列のスキルは、同じもの(同じ参照)のまま", () => {
      const before = sampleSkills();

      const result = moveSkill(before, 1, "unlearned", 2, TODAY); // 未習得の中の並び替え

      for (const id of [4, 5, 6]) {
        expect(get(result, id)).toBe(get(before, id));
      }
    });

    it("スキル名・ポイント・優先度・期限は、変わらない", () => {
      const result = moveSkill(sampleSkills(), 3, "learning", 0, TODAY);

      expect(get(result, 3)).toMatchObject({
        name: "受発注システムの操作",
        note: "手順書を先に読む。",
        priority: "high",
        dueDate: "2026-09-10",
      });
    });

    it("元の配列を書き換えない", () => {
      const before = frozen(sampleSkills());

      expect(() => moveSkill(before, 1, "mastered", 0, TODAY)).not.toThrow();
      expect(get(before, 1).status).toBe("unlearned");
    });

    it("存在しない id や、決まった値でない状態のときは、何も変えない", () => {
      const before = sampleSkills();

      expect(moveSkill(before, 999, "learning", 0, TODAY)).toEqual(before);
      expect(moveSkill(before, 1, "bogus" as Status, 0, TODAY)).toEqual(before);
    });

    it("ランダムに 1000 回移動しても、規則が崩れない(数、連番、習得日)", () => {
      let skills = sampleSkills();
      let seed = 12345;
      const random = (max: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % max;
      };

      for (let step = 0; step < 1000; step++) {
        const id = skills[random(skills.length)].id;
        skills = moveSkill(skills, id, STATUSES[random(3)], random(6) - 1, `2026-09-${String((step % 28) + 1).padStart(2, "0")}`);

        expect(skills).toHaveLength(6);
        expect(new Set(skills.map((s) => s.id)).size).toBe(6);
        for (const status of STATUSES) {
          const column = skillsInStatus(skills, status);
          expect(column.map((s) => s.position)).toEqual(column.map((_, index) => index)); // 0 からの連番
        }
        for (const skill of skills) {
          expect(skill.acquiredOn !== null).toBe(skill.status === "mastered"); // 習得済みだけが、習得日を持つ
        }
      }
    });
  });
});

describe("sortByPriority(優先度順)", () => {
  it("高 → 中 → 低の順に並べ替える。同じ優先度は、元の順番を保つ", () => {
    const column = [
      makeSkill({ id: 1, priority: "low", position: 0 }),
      makeSkill({ id: 2, priority: "high", position: 1 }),
      makeSkill({ id: 3, priority: "medium", position: 2 }),
      makeSkill({ id: 4, priority: "high", position: 3 }),
      makeSkill({ id: 5, priority: "low", position: 4 }),
    ];

    const result = sortByPriority(column, "unlearned");

    expect(ids(result, "unlearned")).toEqual([2, 4, 3, 1, 5]);
    expect(positions(result, "unlearned").map(([, position]) => position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("プロトタイプ・バックエンドと同じ結果: 未習得(低・中・高)は高・中・低、習得中(中・高)は高・中", () => {
    expect(ids(sortByPriority(sampleSkills(), "unlearned"), "unlearned")).toEqual([3, 2, 1]);
    expect(ids(sortByPriority(sampleSkills(), "learning"), "learning")).toEqual([5, 4]);
  });

  it("ほかの列は、同じもの(同じ参照)のまま", () => {
    const before = sampleSkills();

    const result = sortByPriority(before, "unlearned");

    for (const id of [4, 5, 6]) {
      expect(get(result, id)).toBe(get(before, id));
    }
  });

  it("習得済みは、並べ替えできない(エラー)", () => {
    expect(() => sortByPriority(sampleSkills(), "mastered" as "unlearned")).toThrow("習得済みの列は、優先度順に並べ替えできません。");
  });

  it("もう一度並べ替えても、結果は同じ(何度押しても同じ)", () => {
    const once = sortByPriority(sampleSkills(), "unlearned");

    expect(sortByPriority(once, "unlearned")).toEqual(once);
  });

  it("並べ替えても、スキルの内容は変わらない(変わるのは並び順だけ)", () => {
    const before = sampleSkills();

    const result = sortByPriority(before, "unlearned");

    for (const skill of before) {
      expect({ ...get(result, skill.id), position: 0 }).toEqual({ ...skill, position: 0 });
    }
  });

  it("並び順が歯抜けでも、0 からの連番に直る", () => {
    const gaps = [
      makeSkill({ id: 1, priority: "low", position: 2 }),
      makeSkill({ id: 2, priority: "high", position: 7 }),
    ];

    expect(positions(sortByPriority(gaps, "unlearned"), "unlearned")).toEqual([[2, 0], [1, 1]]);
  });

  it("スキルがない列、1件だけの列でも、エラーにならない", () => {
    expect(sortByPriority([], "learning")).toEqual([]);
    expect(ids(sortByPriority([makeSkill({ id: 1 })], "unlearned"), "unlearned")).toEqual([1]);
  });

  it("元の配列を書き換えない", () => {
    const before = frozen(sampleSkills());

    expect(() => sortByPriority(before, "unlearned")).not.toThrow();
  });
});

describe("replaceSkill(編集のあとの置き換え)", () => {
  it("同じ id のスキルを、更新後のものに置き換える。ほかは、同じもの(同じ参照)のまま", () => {
    const before = sampleSkills();

    const result = replaceSkill(before, { ...get(before, 2), name: "発注書の確認(改)", priority: "high" });

    expect(get(result, 2)).toMatchObject({ name: "発注書の確認(改)", priority: "high", status: "unlearned", position: 1 });
    for (const id of [1, 3, 4, 5, 6]) expect(get(result, id)).toBe(get(before, id));
    expect(result).toHaveLength(6);
  });

  it("同じ id がなければ、何も変えない", () => {
    const before = sampleSkills();

    expect(replaceSkill(before, makeSkill({ id: 999 }))).toEqual(before);
  });

  it("元の配列を書き換えない", () => {
    const before = frozen(sampleSkills());

    expect(() => replaceSkill(before, { ...before[0], name: "x" })).not.toThrow();
    expect(before[0].name).toBe("クレーム対応");
  });
});

describe("removeSkill(削除。同じ列の並び順を詰める。バックエンドと同じ規則)", () => {
  // バックエンドの spec と同じ例: A B C D(並び順 0, 1, 2, 3)
  const abcd = () => ["A", "B", "C", "D"].map((name, i) => makeSkill({ id: i + 1, name, position: i }));

  it("真ん中を削除すると、後ろのスキルが1つずつ前に詰まる", () => {
    expect(positions(removeSkill(abcd(), 2), "unlearned")).toEqual([[1, 0], [3, 1], [4, 2]]);
  });

  it("先頭を削除すると、すべてが1つずつ前に詰まる", () => {
    expect(positions(removeSkill(abcd(), 1), "unlearned")).toEqual([[2, 0], [3, 1], [4, 2]]);
  });

  it("末尾を削除しても、ほかの並び順は変わらない", () => {
    expect(positions(removeSkill(abcd(), 4), "unlearned")).toEqual([[1, 0], [2, 1], [3, 2]]);
  });

  it("続けて削除しても、いつも 0 からの連番", () => {
    const result = removeSkill(removeSkill(abcd(), 2), 3);

    expect(positions(result, "unlearned")).toEqual([[1, 0], [4, 1]]);
  });

  it("最後の1件を削除すると、その列は空になる", () => {
    expect(removeSkill([makeSkill({ id: 1 })], 1)).toEqual([]);
  });

  it("並び順が歯抜けでも、0 からの連番に直る(順番は変えない)", () => {
    const gaps = [
      makeSkill({ id: 1, position: 0 }),
      makeSkill({ id: 2, position: 2 }),
      makeSkill({ id: 3, position: 7 }),
    ];

    expect(positions(removeSkill(gaps, 1), "unlearned")).toEqual([[2, 0], [3, 1]]);
  });

  it("ほかの列は、同じもの(同じ参照)のまま。習得済みの列を削除しても、習得日は変わらない", () => {
    const before = sampleSkills();

    const result = removeSkill(before, 2); // 未習得を削除

    for (const id of [4, 5, 6]) expect(get(result, id)).toBe(get(before, id));
    expect(positions(result, "unlearned")).toEqual([[1, 0], [3, 1]]);

    const mastered = removeSkill(
      [
        makeSkill({ id: 1, status: "mastered", acquiredOn: "2026-09-01", position: 0 }),
        makeSkill({ id: 2, status: "mastered", acquiredOn: "2026-09-02", position: 1 }),
      ],
      1,
    );
    expect(mastered).toEqual([makeSkill({ id: 2, status: "mastered", acquiredOn: "2026-09-02", position: 0 })]);
  });

  it("存在しない id のときは、何も変えない", () => {
    const before = sampleSkills();

    expect(removeSkill(before, 999)).toEqual(before);
  });

  it("元の配列を書き換えない", () => {
    const before = frozen(sampleSkills());

    expect(() => removeSkill(before, 1)).not.toThrow();
    expect(before).toHaveLength(6);
  });

  it("削除したあとに追加すると、詰めたあとの末尾になる(サーバーと同じ並び順)", () => {
    const afterRemove = removeSkill(abcd(), 2); // A, C, D → 並び順 0, 1, 2

    expect(Math.max(...skillsInStatus(afterRemove, "unlearned").map((s) => s.position)) + 1).toBe(3);
  });
});
