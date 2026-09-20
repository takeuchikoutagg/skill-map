import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page"; // "@/" の書き方(vitest.config.mts の alias)が、動くことも確かめる
import { sampleSkills, toApiSkill } from "@/lib/fixtures";

// API の返事を、模擬する(本物の通信はしない)
// Response なら、その返事を返す。それ以外(例外)なら、通信に失敗した(reject)ことにする
function stubFetch(response: Response | unknown) {
  const fetchMock = response instanceof Response ? vi.fn().mockResolvedValue(response) : vi.fn().mockRejectedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const skillsResponse = () =>
  new Response(JSON.stringify(sampleSkills().map(toApiSkill)), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("トップページ(スキルボード)", () => {
  it("API から取得したスキルを、3つの列に表示する", async () => {
    stubFetch(skillsResponse());

    render(await Home());

    expect(screen.getByRole("region", { name: "未習得" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "習得済み" })).getByText("レジ締め")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
  });

  it("環境変数 API_URL の場所から、最新を取得する(キャッシュしない)", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchMock = stubFetch(skillsResponse());

    await Home();

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/skills", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("期限切れの判定には、日本時間の「今日」を使う", async () => {
    // 受発注システムの操作の期限は 2026-09-10。日本時間の 9/11 になった直後(UTC では 9/10 の 15:00)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 10, 15, 0, 0)));
    stubFetch(skillsResponse());
    const { unmount } = render(await Home());
    expect(screen.getByText("期限: 2026-09-10(期限切れ)")).toBeInTheDocument();
    unmount();

    // 日本時間の 9/10(UTC では 9/10 の 14:59)は、まだ期限の当日なので、期限切れではない
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 10, 14, 59, 0)));
    stubFetch(skillsResponse());
    render(await Home());
    expect(screen.queryByText(/期限切れ/)).not.toBeInTheDocument();
  });

  it("API に接続できないときは、エラーを表示する(ボードは表示しない)", async () => {
    stubFetch(new TypeError("fetch failed"));

    render(await Home());

    expect(screen.getByRole("alert")).toHaveTextContent("スキルを取得できませんでした");
    expect(screen.getByRole("alert")).toHaveTextContent("に接続できませんでした");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("API が、時間内に返事をしないときも、エラーを表示する", async () => {
    stubFetch(new DOMException("The operation timed out.", "TimeoutError"));

    render(await Home());

    expect(screen.getByRole("alert")).toHaveTextContent("時間内に返事がありませんでした");
  });

  it("API がエラーを返したときも、エラーを表示する", async () => {
    stubFetch(new Response(JSON.stringify({ errors: { base: ["問題が起きました。"] } }), { status: 500 }));

    render(await Home());

    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
