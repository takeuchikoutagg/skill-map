// スキルの入力フォームの、エラーの扱い。
// API のエラー(項目名は due_date など)を、フォームの項目名(dueDate など)に対応させて、項目の下に表示できる形にする。
import { ApiError } from "@/lib/api";
import type { SkillInputErrors } from "@/lib/board";

// フォームのエラー。項目ごとのメッセージと、項目に結びつかないメッセージ(general)
export type SkillFormErrors = SkillInputErrors & { general?: string };

// API の項目名 → フォームの項目名
const FORM_FIELDS: Record<string, keyof SkillInputErrors> = {
  name: "name",
  note: "note",
  priority: "priority",
  due_date: "dueDate",
};

// 追加・編集に失敗したときの例外を、フォームに表示するエラーにする
export function toFormErrors(error: unknown): SkillFormErrors {
  if (error instanceof ApiError) {
    const errors: SkillFormErrors = {};
    const others: string[] = [];

    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const formField = FORM_FIELDS[field];
      if (formField && messages.length > 0) {
        errors[formField] = messages.join(" ");
      } else {
        others.push(...messages) // base や、フォームにない項目(status など)は、まとめて general に出す
      }
    }
    if (others.length > 0) {
      errors.general = others.join(" ");
    } else if (Object.keys(errors).length === 0) {
      errors.general = `保存できませんでした(HTTP ${error.status})。`;
    }
    return errors;
  }

  // 時間切れの例外は、実行環境によって Error として扱われないことがあるので、名前で判断する
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { general: "API から、時間内に返事がありませんでした。もう一度、試してください。" };
  }
  return { general: "API に接続できませんでした。バックエンドが動いているかを確かめてください。" };
}
