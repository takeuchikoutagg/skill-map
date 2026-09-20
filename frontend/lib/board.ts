// ボードの動きの中心(画面に依存しない関数)。プロトタイプ(prototype/logic.js)を、TypeScript に移したもの。
// バックエンド(Rails)と同じ規則で、スキルの並び替えを行う(docs/02-機能要件.md の F-05〜F-07)。
//
// どの関数も、渡されたスキルの配列を書き換えず、新しい配列を返す。
// 並び順(position)は、同じ状態の中で 0 から連番。移動や並べ替えのあとも、その形を保つ。
import {
  NAME_MAX,
  NOTE_MAX,
  PRIORITIES,
  STATUSES,
  type Priority,
  type Skill,
  type Status,
} from "@/lib/types";

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// 並べ替えできる状態(習得済みは、並べ替えできない)
export type SortableStatus = "unlearned" | "learning";

// 今日の日付(YYYY-MM-DD)を、日本時間で返す。習得日などの、サーバーの日付に合わせるために使う。
export function todayInTokyo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// 期限切れ: 期限が今日より前で、習得済みではないスキル
export function isOverdue(skill: Skill, today: string): boolean {
  return skill.status !== "mastered" && skill.dueDate !== null && skill.dueDate < today;
}

// ある状態のスキルを、並び順(同じなら id)の順に返す
export function skillsInStatus(skills: readonly Skill[], status: Status): Skill[] {
  return skills
    .filter((skill) => skill.status === status)
    .sort((a, b) => a.position - b.position || a.id - b.id);
}

// 状態ごとに分ける(画面の3つの列)
export function groupByStatus(skills: readonly Skill[]): Record<Status, Skill[]> {
  return {
    unlearned: skillsInStatus(skills, "unlearned"),
    learning: skillsInStatus(skills, "learning"),
    mastered: skillsInStatus(skills, "mastered"),
  };
}

// ---------- 入力チェック ----------

export type SkillInput = {
  name: string;
  note: string;
  priority: string;
  dueDate: string;
};

export type SkillInputErrors = Partial<Record<keyof SkillInput, string>>;

// 入力チェック(バックエンドと同じ規則・同じ文言)。問題がなければ、空のオブジェクトを返す
export function validateSkillInput(input: SkillInput): SkillInputErrors {
  const errors: SkillInputErrors = {};
  const name = input.name.trim();

  if (name === "") {
    errors.name = "スキル名を入力してください。";
  } else if (name.length > NAME_MAX) {
    errors.name = `スキル名は${NAME_MAX}文字以内で入力してください。`;
  }
  if (!(PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.priority = "優先度を選んでください。";
  }
  if (input.dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    errors.dueDate = "期限は日付で入力してください。";
  }
  if (input.note.length > NOTE_MAX) {
    errors.note = `ポイント・考察は${NOTE_MAX.toLocaleString("ja-JP")}文字以内で入力してください。`;
  }
  return errors;
}

// ---------- 移動と並べ替え ----------

// 並び順を、その状態の中で 0 から連番に振り直したスキルを返す(すでに連番なら、同じものを返す)
function renumbered(column: Skill[]): Skill[] {
  return column.map((skill, index) => (skill.position === index ? skill : { ...skill, position: index }));
}

/*
 * スキルの移動(列間の移動と、列内の並び替え)。バックエンドの SkillMover と同じ規則。
 *   index: 移動先の列の中の位置(0 始まり)。移動したあとの位置で指定し、移動するスキル自身は数えない。
 *          列の長さより大きい値は末尾、負の値は先頭になる。
 *   習得日: 習得済み以外 → 習得済みは today を記録、習得済み → 習得済み以外は消す。それ以外は変えない。
 *   並び順: 移動元と移動先の両方を、0 から連番に振り直す。ほかの列は変えない。
 * 存在しない id や、決まった値でない状態のときは、何も変えない。
 */
export function moveSkill(
  skills: readonly Skill[],
  id: number,
  toStatus: Status,
  index: number,
  today: string,
): Skill[] {
  const target = skills.find((skill) => skill.id === id);
  if (!target || !(STATUSES as readonly string[]).includes(toStatus)) return [...skills];

  const fromStatus = target.status;
  const others = skills.filter((skill) => skill.id !== id);

  let acquiredOn = target.acquiredOn;
  if (toStatus === "mastered" && fromStatus !== "mastered") {
    acquiredOn = today;
  } else if (toStatus !== "mastered") {
    acquiredOn = null;
  }
  const moved: Skill = { ...target, status: toStatus, acquiredOn };

  const destination = skillsInStatus(others, toStatus);
  const position = Math.max(0, Math.min(index, destination.length));
  const newDestination = renumbered([...destination.slice(0, position), moved, ...destination.slice(position)]);
  const newSource = fromStatus === toStatus ? [] : renumbered(skillsInStatus(others, fromStatus));

  // 変わったスキルだけを、新しいものに置き換える(元の配列の順番は、そのまま)
  const updated = new Map<number, Skill>([...newDestination, ...newSource].map((skill) => [skill.id, skill]));
  return skills.map((skill) => updated.get(skill.id) ?? skill);
}

/*
 * 優先度順の並べ替え(高 → 中 → 低)。バックエンドの SkillSorter と同じ規則。
 *   同じ優先度どうしは、並べ替える前の順番を保つ。並べ替えた列は、並び順を 0 から連番にする。
 *   ほかの列は変えない。習得済みは、並べ替えできない(エラーにする)。
 */
export function sortByPriority(skills: readonly Skill[], status: SortableStatus): Skill[] {
  if (status !== "unlearned" && status !== "learning") {
    throw new Error("習得済みの列は、優先度順に並べ替えできません。");
  }

  // いまの順番(index)も、比べる材料に入れる。JavaScript の sort も、同じ値の順番を保つ決まりだが、
  // バックエンドの SkillSorter と同じ「同じ優先度は、元の位置で決める」形にそろえて、意図をはっきりさせる
  const sorted = skillsInStatus(skills, status)
    .map((skill, index) => ({ skill, index }))
    .sort((a, b) => PRIORITY_RANK[a.skill.priority] - PRIORITY_RANK[b.skill.priority] || a.index - b.index)
    .map(({ skill }) => skill);

  const updated = new Map<number, Skill>(renumbered(sorted).map((skill) => [skill.id, skill]));
  return skills.map((skill) => updated.get(skill.id) ?? skill);
}
