// バックエンド(Rails API)との通信。API の仕様は docs/02-機能要件.md。
// 一覧の取得は、Next.js のサーバーから。追加などの操作は、ブラウザから直接 API を呼ぶ(そのため、CORS の許可が関わる)。
import type { SkillInput } from "@/lib/board";
import { PRIORITIES, STATUSES, type Priority, type Skill, type Status } from "@/lib/types";

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

// API の返事の形が、想定と違うときの、エラー(項目名は問わない。base にまとめる)
function malformedResponse(status: number): ApiError {
  return new ApiError(status, { base: [ "API の返事の形が正しくありません。" ] });
}

// API が返した値が、本当に「スキル1件」の形をしているかを、実行時に確かめる。
// (TypeScript の型は、コンパイルのときだけの決まりごとで、実際に届いた値が、その形である保証にはならない。
//  API の仕様が変わった、バックエンドが別のバグで違う形を返した、といったときに、`raw.status` が `undefined` のまま
//  画面に「優先度: undefined」と出たり、知らない状態のスキルが、どの列にも表示されず、黙って消えたりするのを防ぐ)
function isApiSkill(value: unknown): value is ApiSkill {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;

  return (
    typeof raw.id === "number" &&
    typeof raw.name === "string" &&
    (raw.note === null || typeof raw.note === "string") &&
    (STATUSES as readonly unknown[]).includes(raw.status) &&
    (PRIORITIES as readonly unknown[]).includes(raw.priority) &&
    (raw.due_date === null || typeof raw.due_date === "string") &&
    (raw.acquired_on === null || typeof raw.acquired_on === "string") &&
    typeof raw.position === "number"
  );
}

// 応答が、スキル1件の形であることを確かめてから、画面の形にする。違えば、ApiError を投げる
function toValidatedSkill(body: unknown, status: number): Skill {
  if (!isApiSkill(body)) throw malformedResponse(status);
  return toSkill(body);
}

// 応答が、スキルの配列であることを確かめてから、画面の形にする。1件でも形が違えば、ApiError を投げる
function toValidatedSkills(body: unknown, status: number): Skill[] {
  if (!Array.isArray(body) || !body.every(isApiSkill)) throw malformedResponse(status);
  return body.map(toSkill);
}

// API の返事を待つ、いちばん長い時間(ミリ秒)
export const REQUEST_TIMEOUT_MS = 10_000;

// Next.js のサーバー(ページを作る側)から、API を呼ぶときの場所。既定は、開発中のバックエンド
export function serverApiUrl(): string {
  return (process.env.API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

// ブラウザから、API を呼ぶときの場所。既定は、開発中のバックエンド。
// NEXT_PUBLIC_ で始まる環境変数は、ブラウザに渡される。本番で、同じオリジンから API を呼ぶ(Nginx で振り分ける)ときは、空にする。
export function browserApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

// サーバーが、その操作を、受け付けなかった(何も変わっていない)と分かる失敗か。
//   はい: 4xx(入力が正しくない、存在しない、など)と、503(ロックを待ちきれず、処理されなかった)
//   いいえ: 時間切れ、接続断、500 など。サーバーで、処理されたのかどうか、分からない(返事だけが、届かなかったのかもしれない)
export function isRejectedByServer(error: unknown): boolean {
  return error instanceof ApiError && ((error.status >= 400 && error.status < 500) || error.status === 503);
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

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown; // JSON にして送る中身。省略すると、中身のないリクエスト(GET、DELETE)になる
  baseUrl: string;
  noStore?: boolean; // true なら、キャッシュしない(GET /skills だけで使う)
};

// fetch の、共通のやりとり(場所の組み立て、ヘッダー、時間切れ、失敗したときの ApiError 化)を、1か所にまとめたもの。
// 個々の関数(fetchSkills など)は、これを呼んで、自分の応答の形(1件、配列、中身なし)だけを、確かめる。
async function request(path: string, { method = "GET", body, baseUrl, noStore }: RequestOptions): Promise<{ body: unknown; status: number }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(noStore ? { cache: "no-store" as const } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) return { body: undefined, status: response.status }; // 中身のない成功(削除)

  return { body: await response.json(), status: response.status };
}

// GET /api/v1/skills: すべてのスキルを取得する(状態、並び順の順に返ってくる)。
// 表示のたびに、最新を取得する(キャッシュしない)。取得できなければ、例外を投げる。
export async function fetchSkills(baseUrl: string = serverApiUrl()): Promise<Skill[]> {
  const { body, status } = await request("/api/v1/skills", { baseUrl, noStore: true });
  return toValidatedSkills(body, status);
}

// POST /api/v1/skills: スキルを追加する。追加したスキルは、指定した状態の列の末尾に置かれる(並び順は、サーバーが決める)。
// 成功したら、作られたスキルを返す。入力が正しくないとき(422)などは、ApiError を投げる。
// status は、追加先の列(習得済みには追加できない)。
export async function createSkill(status: Status, input: SkillInput, baseUrl: string = browserApiUrl()): Promise<Skill> {
  const { body, status: httpStatus } = await request("/api/v1/skills", {
    method: "POST",
    baseUrl,
    body: {
      name: input.name,
      // 空のポイント・考察と期限は、「ない」(null)として送る
      note: input.note === "" ? null : input.note,
      status,
      priority: input.priority,
      due_date: input.dueDate === "" ? null : input.dueDate,
    },
  });
  return toValidatedSkill(body, httpStatus);
}

// PATCH /api/v1/skills/:id: スキルを編集する。送るのは、編集できる項目(スキル名・ポイント・優先度・期限)だけ。
// 状態・並び順・習得日は、編集では変えられないので、送らない(状態と並び順は移動で、習得日はサーバーが自動で決める)。
// 成功したら、更新後のスキルを返す。入力が正しくない(422)、存在しない(404)ときなどは、ApiError を投げる。
export async function updateSkill(id: number, input: SkillInput, baseUrl: string = browserApiUrl()): Promise<Skill> {
  const { body, status } = await request(`/api/v1/skills/${id}`, {
    method: "PATCH",
    baseUrl,
    body: {
      name: input.name,
      note: input.note === "" ? null : input.note, // 空にすると、ポイント・考察を消す(null)
      priority: input.priority,
      due_date: input.dueDate === "" ? null : input.dueDate, // 空にすると、期限を消す(null)
    },
  });
  return toValidatedSkill(body, status);
}

// DELETE /api/v1/skills/:id: スキルを削除する。成功したら(204。中身なし)、何も返さない。
// サーバーは、削除したあとに、同じ列の並び順を詰める。存在しない(404)ときなどは、ApiError を投げる。
export async function deleteSkill(id: number, baseUrl: string = browserApiUrl()): Promise<void> {
  await request(`/api/v1/skills/${id}`, { method: "DELETE", baseUrl });
}

// PATCH /api/v1/skills/:id/move: スキルを、指定した列(状態)の、指定した位置に移動する(列間の移動と、列内の並び替え)。
// position は、移動したあとの位置(0 始まり)。移動元・移動先の並び順の振り直しと、習得日の記録・消去は、サーバーが行う。
// 成功したら、移動したスキル(サーバーが決めた、習得日と並び順を含む)を返す。
export async function requestMove(id: number, status: Status, position: number, baseUrl: string = browserApiUrl()): Promise<Skill> {
  const { body, status: httpStatus } = await request(`/api/v1/skills/${id}/move`, { method: "PATCH", baseUrl, body: { status, position } });
  return toValidatedSkill(body, httpStatus);
}

// POST /api/v1/skills/sort: 未習得か習得中の列を、優先度の高い順(高 → 中 → 低)に並べ替えて、保存する。
// 同じ優先度のスキルは、もとの順番を保つ。並び順の振り直しは、サーバーが行う。
// 成功したら、並べ替えたあとの、その列のスキルを、並び順の順に返す(スキルがない列は、空の配列)。
export async function requestSort(status: Status, baseUrl: string = browserApiUrl()): Promise<Skill[]> {
  const { body, status: httpStatus } = await request("/api/v1/skills/sort", { method: "POST", baseUrl, body: { status } });
  return toValidatedSkills(body, httpStatus);
}
