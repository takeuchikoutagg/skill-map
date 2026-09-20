// バックエンド(Rails API)との通信。API の仕様は docs/02-機能要件.md。
// F2 では、スキルの一覧の取得だけ。追加・編集・移動などは、あとのステップで足す。
import type { Priority, Skill, Status } from "@/lib/types";

// API が返す、スキル1件の形。項目名は snake_case(Rails の慣習)
export type ApiSkill = {
  id: number;
  name: string;
  note: string | null;
  status: Status;
  priority: Priority;
  due_date: string | null;
  acquired_on: string | null;
  position: number;
};

// 項目ごとのエラーメッセージ。例: { name: ["スキル名を入力してください"] }。項目に結びつかないものは、base に入る
export type FieldErrors = Record<string, string[]>;

// API がエラーを返したとき(422、404、400 など)の例外
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, fieldErrors: FieldErrors) {
    const messages = Object.values(fieldErrors).flat();
    super(messages.length > 0 ? messages.join(" ") : `API がエラーを返しました(HTTP ${status})。`);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  // すべてのメッセージを、1つの配列にしたもの
  get messages(): string[] {
    return Object.values(this.fieldErrors).flat();
  }
}

// API の項目名(due_date)を、画面側の書き方(dueDate)に変える
export function toSkill(raw: ApiSkill): Skill {
  return {
    id: raw.id,
    name: raw.name,
    note: raw.note,
    status: raw.status,
    priority: raw.priority,
    dueDate: raw.due_date,
    acquiredOn: raw.acquired_on,
    position: raw.position,
  };
}

// API の返事を待つ、いちばん長い時間(ミリ秒)
export const REQUEST_TIMEOUT_MS = 10_000;

// Next.js のサーバー(ページを作る側)から、API を呼ぶときの場所。既定は、開発中のバックエンド
export function serverApiUrl(): string {
  return (process.env.API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

// エラーの返事({ "errors": { "name": ["…"] } })を読んで、ApiError にする。読めなければ、メッセージなしの ApiError
export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    const errors = (body as { errors?: unknown } | null)?.errors;

    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      const fieldErrors: FieldErrors = {};
      for (const [field, messages] of Object.entries(errors)) {
        if (Array.isArray(messages)) {
          fieldErrors[field] = messages.filter((message): message is string => typeof message === "string");
        }
      }
      return new ApiError(response.status, fieldErrors);
    }
  } catch {
    // JSON として読めなかった(サーバーが、エラーの形で返さなかった)ときは、下の、メッセージなしの ApiError にする
  }
  return new ApiError(response.status, {});
}

// GET /api/v1/skills: すべてのスキルを取得する(状態、並び順の順に返ってくる)。
// 表示のたびに、最新を取得する(キャッシュしない)。取得できなければ、例外を投げる。
export async function fetchSkills(baseUrl: string = serverApiUrl()): Promise<Skill[]> {
  // API が返事をしないときに、ページが、いつまでも待ち続けないよう、時間制限をつける
  const response = await fetch(`${baseUrl}/api/v1/skills`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new ApiError(response.status, { base: ["API の返事の形が正しくありません。"] });
  }
  return (body as ApiSkill[]).map(toSkill);
}
