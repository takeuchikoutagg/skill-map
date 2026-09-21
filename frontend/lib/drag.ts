// ドラッグ&ドロップで、「どの列の、何番目に置くか」を決める部分。画面(React・@dnd-kit)に依存しない関数だけを置く。
// 私は、ブラウザでの実際のドラッグを自動では確かめられないので、結果を決める規則は、ここに切り離して、細かくテストする。
//
// 使い方の流れ(components/Board.tsx):
//   ドラッグを始める → itemsFromSkills で、列ごとのカードの並び(id の配列)を作る
//   ドラッグ中、別の列の上に来た → moveOver で、その列に一時的に入れる(見た目の場所を空ける)
//   手を離す → resolveDrop で、最終的な(列, 位置)を決める → board.ts の moveSkill と API で、移動する
import type { UniqueIdentifier } from "@dnd-kit/core";
import { skillsInStatus } from "@/lib/board";
import { STATUS_LABELS, STATUSES, type Skill, type Status } from "@/lib/types";

// 列ごとの、カードの並び(id の配列)。ドラッグ中の、見た目のための並び
export type ColumnItems = Record<Status, number[]>;

// 移動先: どの列の、何番目か(0 始まり。移動したあとの位置)
export type DropTarget = { status: Status; index: number };

// ---------- 列の、ドロップ先としての id ----------
// カードの id は数字(スキルの id)。列(ドロップ先)の id は、文字列 "column:unlearned" のような形にして、区別する。

const COLUMN_PREFIX = "column:";

export function columnDropId(status: Status): string {
  return `${COLUMN_PREFIX}${status}`;
}

// 列の id なら、その状態を返す。カードの id(数字)や、決まった形でない文字列なら null
export function statusFromColumnDropId(id: UniqueIdentifier): Status | null {
  if (typeof id !== "string" || !id.startsWith(COLUMN_PREFIX)) return null;
  const status = id.slice(COLUMN_PREFIX.length);
  return (STATUSES as readonly string[]).includes(status) ? (status as Status) : null;
}

// ---------- 並びの作成と検索 ----------

export function itemsFromSkills(skills: readonly Skill[]): ColumnItems {
  return {
    unlearned: skillsInStatus(skills, "unlearned").map((skill) => skill.id),
    learning: skillsInStatus(skills, "learning").map((skill) => skill.id),
    mastered: skillsInStatus(skills, "mastered").map((skill) => skill.id),
  };
}

// カードが、いま、どの列にあるか(見つからなければ null)
export function findStatus(items: ColumnItems, id: number): Status | null {
  return STATUSES.find((status) => items[status].includes(id)) ?? null;
}

// ドロップ先(カード、または列)が、どの列に属するか
function statusOfTarget(items: ColumnItems, overId: UniqueIdentifier): Status | null {
  const column = statusFromColumnDropId(overId);
  if (column) return column;
  return typeof overId === "number" ? findStatus(items, overId) : null;
}

// スキルの、いまの(列, 位置)。並び順の順に数えた、列の中の位置
export function currentPosition(skills: readonly Skill[], id: number): DropTarget | null {
  const skill = skills.find((s) => s.id === id);
  if (!skill) return null;
  return { status: skill.status, index: skillsInStatus(skills, skill.status).findIndex((s) => s.id === id) };
}

// 並び(id の配列)から、画面に出すスキルの並びを作る。スキルが見つからない id は、飛ばす
export function columnsFromItems(skills: readonly Skill[], items: ColumnItems): Record<Status, Skill[]> {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const pick = (ids: number[]) => ids.flatMap((id) => byId.get(id) ?? []);
  return { unlearned: pick(items.unlearned), learning: pick(items.learning), mastered: pick(items.mastered) };
}

// ---------- ドラッグ中の、一時的な並び ----------

// ドラッグしているカードの上端が、重なっているカードの、真ん中より下にあるか。下なら、そのカードの「後ろ」に入れる
export function isBelow(activeRect: { top: number }, overRect: { top: number; height: number }): boolean {
  return activeRect.top > overRect.top + overRect.height / 2;
}

/*
 * ドラッグ中に、カードが別の列の上(列そのもの、または、その列のカードの上)に来たときの、一時的な並びを返す。
 * その列に、ドラッグ中のカードを入れる(元の列からは、外す)。見た目で、場所を空けるための並びで、まだ保存はしない。
 *   over が、その列のカード: そのカードの前(isBelowOver なら、後ろ)。 over が、列そのもの: 末尾。
 * 同じ列の中の並び替えは、@dnd-kit/sortable が見た目を動かすので、ここでは、何も変えない(同じ items を返す)。
 * 不明な id のときも、何も変えない。
 */
export function moveOver(
  items: ColumnItems,
  activeId: number,
  overId: UniqueIdentifier,
  isBelowOver: boolean,
): ColumnItems {
  const from = findStatus(items, activeId);
  const to = statusOfTarget(items, overId);
  if (!from || !to || from === to) return items;

  const source = items[from].filter((id) => id !== activeId);
  const destination = [...items[to]];
  const overIndex = typeof overId === "number" ? destination.indexOf(overId) : -1;
  const index = overIndex >= 0 ? overIndex + (isBelowOver ? 1 : 0) : destination.length;
  destination.splice(index, 0, activeId);

  return { ...items, [from]: source, [to]: destination };
}

/*
 * 手を離したときの、最終的な移動先(列, 位置)を決める。位置は、移動したあとの位置(board.ts の moveSkill と同じ)。
 *   同じ列の中: 落とした場所のカードの位置(列そのものの上なら、末尾)。
 *   別の列(ドラッグ中に、その列へ一時的に移っていなかった場合。キーボード操作の途中など): その列の、落とした場所。
 * ドラッグしたカードや、落とした場所が分からないときは、null(何もしない)。
 */
export function resolveDrop(items: ColumnItems, activeId: number, overId: UniqueIdentifier): DropTarget | null {
  const status = findStatus(items, activeId);
  const overStatus = statusOfTarget(items, overId);
  if (!status || !overStatus) return null;

  if (status === overStatus) {
    const column = items[status];
    return { status, index: typeof overId === "number" ? column.indexOf(overId) : column.length - 1 };
  }

  const destination = items[overStatus];
  const overIndex = typeof overId === "number" ? destination.indexOf(overId) : -1;
  return { status: overStatus, index: overIndex >= 0 ? overIndex : destination.length };
}

// ---------- 読み上げ(スクリーンリーダー)の文言 ----------

export const SCREEN_READER_INSTRUCTIONS =
  "スペースキーで、スキルをつかみます。矢印キーで動かし、もう一度スペースキーで置きます。Esc キーで、やめます。";

// 読み上げる、ドロップ先の説明。カードの上なら「『○○』の位置」、列の上なら「『未習得』の列」
function describeTarget(skills: readonly Skill[], overId: UniqueIdentifier): string {
  const column = statusFromColumnDropId(overId);
  if (column) return `「${STATUS_LABELS[column]}」の列`;
  const skill = skills.find((s) => s.id === overId);
  return skill ? `「${skill.name}」の位置` : "その場所";
}

export type DragAnnouncements = {
  onDragStart(args: { active: { id: UniqueIdentifier } }): string;
  onDragOver(args: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }): string;
  onDragEnd(args: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }): string;
  onDragCancel(args: { active: { id: UniqueIdentifier } }): string;
};

// ドラッグの、各場面で読み上げる文言(日本語)。スキルの名前を入れる
export function buildAnnouncements(skills: readonly Skill[]): DragAnnouncements {
  const name = (id: UniqueIdentifier) => skills.find((s) => s.id === id)?.name ?? "スキル";

  return {
    onDragStart: ({ active }) => `「${name(active.id)}」をつかみました。`,
    onDragOver: ({ active, over }) =>
      over ? `「${name(active.id)}」を、${describeTarget(skills, over.id)}の上に動かしています。` : `「${name(active.id)}」は、置ける場所の外にあります。`,
    onDragEnd: ({ active, over }) =>
      over ? `「${name(active.id)}」を、${describeTarget(skills, over.id)}に置きました。` : `「${name(active.id)}」を、元の位置に戻しました。`,
    onDragCancel: ({ active }) => `「${name(active.id)}」の移動を、やめました。元の位置に戻しました。`,
  };
}
