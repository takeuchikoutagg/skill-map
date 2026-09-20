// テストで使う、サンプルのスキル。バックエンドの開発用サンプル(backend/db/seeds.rb)と同じ内容。
// テスト専用。アプリ本体からは、使わない。
import type { ApiSkill } from "@/lib/api";
import type { Skill } from "@/lib/types";

// 必要な項目だけ指定して、スキルを作る(指定しない項目は、既定の値)
export function makeSkill(overrides: Partial<Skill> & { id: number }): Skill {
  return {
    name: `スキル${overrides.id}`,
    note: null,
    status: "unlearned",
    priority: "medium",
    dueDate: null,
    acquiredOn: null,
    position: 0,
    ...overrides,
  };
}

// 未習得(低・中・高)3件、習得中(中・高)2件、習得済み 1件
export function sampleSkills(): Skill[] {
  return [
    makeSkill({ id: 1, name: "クレーム対応", status: "unlearned", priority: "low", dueDate: "2026-12-31", position: 0 }),
    makeSkill({
      id: 2, name: "発注書の確認", note: "数量と単価を、注文書と見比べる。",
      status: "unlearned", priority: "medium", dueDate: "2026-11-15", position: 1,
    }),
    makeSkill({
      id: 3, name: "受発注システムの操作", note: "手順書を先に読む。",
      status: "unlearned", priority: "high", dueDate: "2026-09-10", position: 2,
    }),
    makeSkill({
      id: 4, name: "請求書の発行", note: "締め日に注意。", status: "learning", priority: "medium", dueDate: "2026-10-15", position: 0,
    }),
    makeSkill({ id: 5, name: "月次レポートの作成", status: "learning", priority: "high", dueDate: "2026-10-31", position: 1 }),
    makeSkill({
      id: 6, name: "レジ締め", note: "現金の過不足を必ず二人で確認する。",
      status: "mastered", priority: "medium", acquiredOn: "2026-09-01", position: 0,
    }),
  ];
}

// 画面側のスキルを、API が返す形(snake_case)に戻す(API の返事を、模擬するため)
export function toApiSkill(skill: Skill): ApiSkill {
  return {
    id: skill.id,
    name: skill.name,
    note: skill.note,
    status: skill.status,
    priority: skill.priority,
    due_date: skill.dueDate,
    acquired_on: skill.acquiredOn,
    position: skill.position,
  };
}
