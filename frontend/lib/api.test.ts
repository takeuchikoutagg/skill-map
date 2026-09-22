import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  browserApiUrl,
  createSkill,
  deleteSkill,
  fetchSkills,
  isRejectedByServer,
  parseApiError,
  requestMove,
  requestSort,
  REQUEST_TIMEOUT_MS,
  serverApiUrl,
  toSkill,
  updateSkill,
  type ApiSkill,
} from "@/lib/api";
import { sampleSkills, toApiSkill } from "@/lib/fixtures";

// API の返事を、模擬する(本物の通信はしない)
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("toSkill(API の形 → 画面の形)", () => {
  it("項目名を、snake_case から camelCase に変える", () => {
    const raw: ApiSkill = {
      id: 7, name: "レジ締め", note: "メモ", status: "mastered", priority: "high",
      due_date: "2026-10-31", acquired_on: "2026-09-01", position: 3,
    };

    expect(toSkill(raw)).toEqual({
      id: 7, name: "レジ締め", note: "メモ", status: "mastered", priority: "high",
      dueDate: "2026-10-31", acquiredOn: "2026-09-01", position: 3,
    });
  });

  it("null(ポイント・期限・習得日がない)は、null のまま", () => {
    const raw: ApiSkill = {
      id: 1, name: "x", note: null, status: "unlearned", priority: "medium",
      due_date: null, acquired_on: null, position: 0,
    };

    expect(toSkill(raw)).toMatchObject({ note: null, dueDate: null, acquiredOn: null });
  });

  it("画面の形 → API の形 → 画面の形、で元に戻る", () => {
    for (const skill of sampleSkills()) {
      expect(toSkill(toApiSkill(skill))).toEqual(skill);
    }
  });
});

describe("serverApiUrl(サーバーから API を呼ぶときの場所)", () => {
  it("環境変数がなければ、開発中のバックエンド(localhost:3001)", () => {
    vi.stubEnv("API_URL", undefined as unknown as string);
    delete process.env.API_URL;

    expect(serverApiUrl()).toBe("http://localhost:3001");
  });

  it("環境変数 API_URL があれば、それを使う。末尾のスラッシュは取り除く", () => {
    vi.stubEnv("API_URL", "http://rails:3000/");

    expect(serverApiUrl()).toBe("http://rails:3000");
  });
});

describe("fetchSkills(一覧の取得)", () => {
  it("API の一覧を取得して、画面の形にして、返された順のまま返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleSkills().map(toApiSkill)));
    vi.stubGlobal("fetch", fetchMock);

    const skills = await fetchSkills("http://api.test");

    expect(skills).toEqual(sampleSkills());
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/skills", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("スキルがないときは、空の配列", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    expect(await fetchSkills("http://api.test")).toEqual([]);
  });

  it("場所を指定しなければ、環境変数 API_URL を使う", async () => {
    vi.stubEnv("API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkills();

    expect(fetchMock).toHaveBeenCalledWith("http://from-env.test/api/v1/skills", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("API がエラー(項目ごとのメッセージつき)を返したら、ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["サーバーで問題が起きました。"] } }, 500)));

    const error = await fetchSkills("http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, fieldErrors: { base: ["サーバーで問題が起きました。"] } });
    expect((error as ApiError).message).toBe("サーバーで問題が起きました。");
  });

  it("エラーの返事が、決まった形でなくても、ApiError を投げる(HTTP のステータスは残る)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 })));

    const error = await fetchSkills("http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, fieldErrors: {} });
    expect((error as ApiError).message).toBe("API がエラーを返しました(HTTP 502)。");
  });

  it("成功の返事が、配列でなければ、ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ skills: [] })));

    const error = await fetchSkills("http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).messages).toEqual(["API の返事の形が正しくありません。"]);
  });

  it("API の返事を待つ時間には、制限がある(10秒)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkills("http://api.test");

    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(false); // まだ、時間切れではない
  });

  it("API が、時間内に返事をしなかったときは、もとの例外(TimeoutError)がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError")));

    await expect(fetchSkills("http://api.test")).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("API に接続できなかったときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(fetchSkills("http://api.test")).rejects.toThrow("fetch failed");
  });
});

describe("parseApiError(エラーの返事の読み取り)", () => {
  it("項目ごとのメッセージを読み取る(422 の形)", async () => {
    const error = await parseApiError(
      jsonResponse({ errors: { name: ["スキル名を入力してください"], due_date: ["期限は不正な値です"] } }, 422),
    );

    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({ name: ["スキル名を入力してください"], due_date: ["期限は不正な値です"] });
    expect(error.messages).toEqual(["スキル名を入力してください", "期限は不正な値です"]);
  });

  it("404 や 400 の形({ errors: { base: [...] } })も読み取る", async () => {
    const error = await parseApiError(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404));

    expect(error.status).toBe(404);
    expect(error.fieldErrors.base).toEqual(["指定されたスキルが見つかりません。"]);
  });

  it("文字でないメッセージは、取り除く", async () => {
    const error = await parseApiError(jsonResponse({ errors: { name: ["ok", 1, null, { x: 1 }] } }, 422));

    expect(error.fieldErrors.name).toEqual(["ok"]);
  });

  it("errors が、オブジェクトでない(配列・文字列・ない)ときは、メッセージなし", async () => {
    for (const body of [{ errors: [] }, { errors: "x" }, { message: "x" }, null, []]) {
      const error = await parseApiError(jsonResponse(body, 500));

      expect(error.fieldErrors).toEqual({});
    }
  });

  it("JSON として読めない返事でも、ApiError になる", async () => {
    const error = await parseApiError(new Response("これは JSON ではありません", { status: 500 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
  });
});

describe("browserApiUrl(ブラウザから API を呼ぶときの場所)", () => {
  it("環境変数がなければ、開発中のバックエンド(localhost:3001)", () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(browserApiUrl()).toBe("http://localhost:3001");
  });

  it("環境変数 NEXT_PUBLIC_API_URL があれば、それを使う。末尾のスラッシュは取り除く", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.example.com/");

    expect(browserApiUrl()).toBe("http://api.example.com");
  });

  it("空にすると、空のまま(本番で、同じオリジンから API を呼ぶ)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    expect(browserApiUrl()).toBe("");
  });
});

describe("createSkill(スキルの追加)", () => {
  const input = { name: "レジ締め", note: "メモ", priority: "high", dueDate: "2026-10-31" };
  const created: ApiSkill = {
    id: 9, name: "レジ締め", note: "メモ", status: "learning", priority: "high",
    due_date: "2026-10-31", acquired_on: null, position: 2,
  };

  it("追加先の状態と入力を、POST で送り、作られたスキルを画面の形で返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchMock);

    const skill = await createSkill("learning", input, "http://api.test");

    expect(skill).toEqual({
      id: 9, name: "レジ締め", note: "メモ", status: "learning", priority: "high",
      dueDate: "2026-10-31", acquiredOn: null, position: 2,
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/skills");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    // 項目名は、API の書き方(due_date)。画面の書き方(dueDate)ではない
    expect(JSON.parse(options.body as string)).toEqual({
      name: "レジ締め", note: "メモ", status: "learning", priority: "high", due_date: "2026-10-31",
    });
  });

  it("空のポイント・考察と期限は、null として送る", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...created, note: null, due_date: null }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createSkill("unlearned", { ...input, note: "", dueDate: "" }, "http://api.test");

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ note: null, due_date: null, status: "unlearned" });
  });

  it("場所を指定しなければ、環境変数 NEXT_PUBLIC_API_URL を使う", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createSkill("learning", input);

    expect(fetchMock.mock.calls[0][0]).toBe("http://from-env.test/api/v1/skills");
  });

  it("入力が正しくない(422)ときは、項目ごとのメッセージつきの ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { name: ["スキル名を入力してください"] } }, 422)));

    const error = await createSkill("unlearned", input, "http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, fieldErrors: { name: ["スキル名を入力してください"] } });
  });

  it("接続できなかった・時間切れのときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(createSkill("unlearned", input, "http://api.test")).rejects.toThrow("fetch failed");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(createSkill("unlearned", input, "http://api.test")).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("updateSkill(スキルの編集)", () => {
  const input = { name: "レジ締め(改)", note: "更新後のメモ", priority: "low", dueDate: "2026-12-01" };
  const updated: ApiSkill = {
    id: 7, name: "レジ締め(改)", note: "更新後のメモ", status: "mastered", priority: "low",
    due_date: "2026-12-01", acquired_on: "2026-09-01", position: 0,
  };

  it("編集できる項目だけを、PATCH で送り、更新後のスキルを画面の形で返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    const skill = await updateSkill(7, input, "http://api.test");

    expect(skill).toEqual({
      id: 7, name: "レジ締め(改)", note: "更新後のメモ", status: "mastered", priority: "low",
      dueDate: "2026-12-01", acquiredOn: "2026-09-01", position: 0,
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/skills/7");
    expect(options.method).toBe("PATCH");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    // 状態(status)・並び順(position)・習得日(acquired_on)は、編集では送らない
    expect(JSON.parse(options.body as string)).toEqual({
      name: "レジ締め(改)", note: "更新後のメモ", priority: "low", due_date: "2026-12-01",
    });
  });

  it("空にしたポイント・考察と期限は、null で送る(サーバー側で消える)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...updated, note: null, due_date: null }));
    vi.stubGlobal("fetch", fetchMock);

    await updateSkill(7, { ...input, note: "", dueDate: "" }, "http://api.test");

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ note: null, due_date: null });
  });

  it("場所を指定しなければ、環境変数 NEXT_PUBLIC_API_URL を使う", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    await updateSkill(7, input);

    expect(fetchMock.mock.calls[0][0]).toBe("http://from-env.test/api/v1/skills/7");
  });

  it("入力が正しくない(422)、存在しない(404)ときは、ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { name: ["スキル名を入力してください"] } }, 422)));
    const e422 = await updateSkill(7, input, "http://api.test").catch((e: unknown) => e);
    expect(e422).toBeInstanceOf(ApiError);
    expect(e422).toMatchObject({ status: 422, fieldErrors: { name: ["スキル名を入力してください"] } });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404)));
    const e404 = await updateSkill(7, input, "http://api.test").catch((e: unknown) => e);
    expect(e404).toMatchObject({ status: 404, fieldErrors: { base: ["指定されたスキルが見つかりません。"] } });
  });

  it("接続できなかったときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(updateSkill(7, input, "http://api.test")).rejects.toThrow("fetch failed");
  });
});

describe("deleteSkill(スキルの削除)", () => {
  it("DELETE を送る。成功(204。中身なし)したら、何も返さない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteSkill(7, "http://api.test");

    expect(result).toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/skills/7");
    expect(options.method).toBe("DELETE");
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("場所を指定しなければ、環境変数 NEXT_PUBLIC_API_URL を使う", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteSkill(7);

    expect(fetchMock.mock.calls[0][0]).toBe("http://from-env.test/api/v1/skills/7");
  });

  it("存在しない(404)ときは、ApiError を投げる(すでに削除したスキルを、もう一度削除した場合も)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404)));

    const error = await deleteSkill(7, "http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });

  it("接続できなかった・時間切れのときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(deleteSkill(7, "http://api.test")).rejects.toThrow("fetch failed");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(deleteSkill(7, "http://api.test")).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("requestMove(スキルの移動)", () => {
  const moved: ApiSkill = {
    id: 3, name: "受発注システムの操作", note: null, status: "mastered", priority: "high",
    due_date: "2026-09-10", acquired_on: "2026-09-20", position: 0,
  };

  it("移動先の状態と位置を、PATCH で送り、移動後のスキルを画面の形で返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(moved));
    vi.stubGlobal("fetch", fetchMock);

    const skill = await requestMove(3, "mastered", 0, "http://api.test");

    expect(skill).toMatchObject({ id: 3, status: "mastered", acquiredOn: "2026-09-20", position: 0 }); // 習得日は、サーバーが決めた値
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/skills/3/move");
    expect(options.method).toBe("PATCH");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    // 送るのは、移動先(status と position)だけ。習得日などは、送らない
    expect(JSON.parse(options.body as string)).toEqual({ status: "mastered", position: 0 });
  });

  it("場所を指定しなければ、環境変数 NEXT_PUBLIC_API_URL を使う", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(moved));
    vi.stubGlobal("fetch", fetchMock);

    await requestMove(3, "mastered", 0);

    expect(fetchMock.mock.calls[0][0]).toBe("http://from-env.test/api/v1/skills/3/move");
  });

  it("入力が正しくない(422)、存在しない(404)ときは、ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { position: ["並び順は0以上の整数で指定してください"] } }, 422)));
    const e422 = await requestMove(3, "mastered", -1, "http://api.test").catch((e: unknown) => e);
    expect(e422).toBeInstanceOf(ApiError);
    expect(e422).toMatchObject({ status: 422, fieldErrors: { position: ["並び順は0以上の整数で指定してください"] } });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404)));
    const e404 = await requestMove(3, "mastered", 0, "http://api.test").catch((e: unknown) => e);
    expect(e404).toMatchObject({ status: 404 });
  });

  it("接続できなかった・時間切れのときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(requestMove(3, "mastered", 0, "http://api.test")).rejects.toThrow("fetch failed");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(requestMove(3, "mastered", 0, "http://api.test")).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("requestSort(優先度順の並べ替え)", () => {
  const column: ApiSkill[] = [
    { id: 3, name: "受発注システムの操作", note: null, status: "unlearned", priority: "high", due_date: null, acquired_on: null, position: 0 },
    { id: 1, name: "クレーム対応", note: null, status: "unlearned", priority: "low", due_date: null, acquired_on: null, position: 1 },
  ];

  it("並べ替える状態を、POST で送り、並べ替え後の、その列のスキルを、画面の形で返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(column));
    vi.stubGlobal("fetch", fetchMock);

    const skills = await requestSort("unlearned", "http://api.test");

    expect(skills.map((skill) => skill.id)).toEqual([3, 1]); // 返事の順番のまま
    expect(skills[0]).toMatchObject({ priority: "high", dueDate: null, position: 0 }); // 画面の形(camelCase)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/skills/sort");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body as string)).toEqual({ status: "unlearned" });
  });

  it("スキルがない列は、空の配列", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    await expect(requestSort("learning", "http://api.test")).resolves.toEqual([]);
  });

  it("場所を指定しなければ、環境変数 NEXT_PUBLIC_API_URL を使う", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://from-env.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await requestSort("learning");

    expect(fetchMock.mock.calls[0][0]).toBe("http://from-env.test/api/v1/skills/sort");
  });

  it("習得済みを指定した(422)ときは、ApiError を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["習得済みの列は、優先度順に並べ替えできません。"] } }, 422)));

    const error = await requestSort("mastered", "http://api.test").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, fieldErrors: { base: ["習得済みの列は、優先度順に並べ替えできません。"] } });
  });

  it("返事が配列でなければ、ApiError を投げる(壊れた返事で、画面を壊さない)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ oops: true })));

    await expect(requestSort("unlearned", "http://api.test")).rejects.toBeInstanceOf(ApiError);
  });

  it("接続できなかったときは、もとの例外がそのまま出る", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(requestSort("unlearned", "http://api.test")).rejects.toThrow("fetch failed");
  });
});

describe("isRejectedByServer(サーバーが、その操作を、受け付けなかったと分かる失敗か)", () => {
  it.each([400, 404, 409, 422, 499, 503])("HTTP %i は、はい(何も変わっていない)", (status) => {
    expect(isRejectedByServer(new ApiError(status, {}))).toBe(true);
  });

  it.each([500, 502, 504, 200, 301])("HTTP %i は、いいえ(処理されたかどうか、分からない)", (status) => {
    expect(isRejectedByServer(new ApiError(status, {}))).toBe(false);
  });

  it("時間切れ・接続断・その他の例外は、いいえ(返事が届かなかっただけで、サーバーでは処理されたかもしれない)", () => {
    expect(isRejectedByServer(new DOMException("The operation timed out.", "TimeoutError"))).toBe(false);
    expect(isRejectedByServer(new TypeError("fetch failed"))).toBe(false);
    expect(isRejectedByServer(null)).toBe(false);
    expect(isRejectedByServer("なにか")).toBe(false);
  });
});
