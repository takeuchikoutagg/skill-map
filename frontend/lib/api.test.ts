import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchSkills, parseApiError, REQUEST_TIMEOUT_MS, serverApiUrl, toSkill, type ApiSkill } from "@/lib/api";
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
