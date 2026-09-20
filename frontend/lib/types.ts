// スキルに関する型と、決まった値(状態・優先度)。docs/02-機能要件.md、docs/05-ER図.md と合わせる。

// 状態(画面の列にあたる)。この順番で、左から並べる
export const STATUSES = ["unlearned", "learning", "mastered"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  unlearned: "未習得",
  learning: "習得中",
  mastered: "習得済み",
};

// 優先度。高 → 中 → 低 の順
export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

// 入力の長さの上限(バックエンドの Skill モデルと同じ)
export const NAME_MAX = 100;
export const NOTE_MAX = 5000;

// 画面で扱うスキル。API の項目名(due_date など)は、画面側の書き方(dueDate)に変換して使う(lib/api.ts)。
export type Skill = {
  id: number;
  name: string;
  note: string | null; // ポイント・考察
  status: Status;
  priority: Priority;
  dueDate: string | null; // 期限(YYYY-MM-DD)
  acquiredOn: string | null; // 習得日(YYYY-MM-DD)。習得済みのスキルにだけ値が入る
  position: number; // 同じ状態の中の並び順(0 始まり)
};
