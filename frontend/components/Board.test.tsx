import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { LoadError, loadErrorMessage } from "@/components/LoadError";
import { ApiError } from "@/lib/api";
import { makeSkill, sampleSkills, toApiSkill } from "@/lib/fixtures";

const TODAY = "2026-09-20";

// 列(未習得・習得中・習得済み)を、見出しの名前で探す
const column = (name: string) => screen.getByRole("region", { name });

describe("Board(スキルボードの表示)", () => {
  it("3つの列を、左から「未習得」「習得中」「習得済み」の順に表示する", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["未習得", "習得中", "習得済み"]);
  });

  it("列ごとに、スキルを並び順の順に表示し、件数を出す", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const names = (region: HTMLElement) => within(region).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names(column("未習得"))).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
    expect(names(column("習得中"))).toEqual(["請求書の発行", "月次レポートの作成"]);
    expect(names(column("習得済み"))).toEqual(["レジ締め"]);

    expect(within(column("未習得")).getByTitle("スキルの件数")).toHaveTextContent("3");
    expect(within(column("習得中")).getByTitle("スキルの件数")).toHaveTextContent("2");
    expect(within(column("習得済み")).getByTitle("スキルの件数")).toHaveTextContent("1");
  });

  it("「優先度順」と「+ スキルを追加」のボタンは、未習得・習得中の列にだけ表示する(習得済みにはない)", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    for (const name of ["未習得", "習得中"]) {
      expect(within(column(name)).getByRole("button", { name: "優先度順" })).toBeInTheDocument();
      expect(within(column(name)).getByRole("button", { name: "+ スキルを追加" })).toBeInTheDocument();
    }
    expect(within(column("習得済み")).queryByRole("button", { name: "優先度順" })).not.toBeInTheDocument();
    expect(within(column("習得済み")).queryByRole("button", { name: "+ スキルを追加" })).not.toBeInTheDocument();
  });

  it("追加ボタンは押せる。まだ使えない操作(優先度順・削除)のボタンは、押せない状態で表示する", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    for (const button of screen.getAllByRole("button", { name: "+ スキルを追加" })) {
      expect(button).toBeEnabled();
    }
    const notYet = [
      ...screen.getAllByRole("button", { name: "優先度順" }),
      ...screen.getAllByRole("button", { name: "削除" }),
    ];
    expect(notYet.length).toBeGreaterThan(0);
    for (const button of notYet) {
      expect(button).toBeDisabled();
    }
  });

  it("習得日は、習得済みのカードにだけ表示する", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(screen.getAllByText(/習得日:/)).toHaveLength(1);
    expect(within(column("習得済み")).getByText("習得日: 2026-09-01")).toBeInTheDocument();
    expect(within(column("未習得")).queryByText(/習得日:/)).not.toBeInTheDocument();
    expect(within(column("習得中")).queryByText(/習得日:/)).not.toBeInTheDocument();
  });

  it("習得済みなのに習得日がないデータでも、「習得日: -」と表示する(壊れない)", () => {
    const skills = [makeSkill({ id: 1, status: "mastered", acquiredOn: null })];

    render(<Board initialSkills={skills} today={TODAY} />);

    expect(screen.getByText("習得日: -")).toBeInTheDocument();
  });

  it("優先度を、色付きのバッジと文字(高・中・低)で表示する", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    // サンプルは、高 2件、中 3件、低 1件
    const high = screen.getAllByText("優先度: 高");
    const medium = screen.getAllByText("優先度: 中");
    const low = screen.getAllByText("優先度: 低");
    expect([high.length, medium.length, low.length]).toEqual([2, 3, 1]);
    for (const badge of high) expect(badge).toHaveClass("prio", "prio-high");
    for (const badge of medium) expect(badge).toHaveClass("prio", "prio-medium");
    for (const badge of low) expect(badge).toHaveClass("prio", "prio-low");
  });

  it("期限を表示する。ないときは「-」", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(within(column("未習得")).getByText("期限: 2026-12-31")).toBeInTheDocument();
    expect(within(column("習得済み")).getByText("期限: -")).toBeInTheDocument();
  });

  it("期限を過ぎた、習得済みでないスキルは、「(期限切れ)」と強調して表示する", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const overdue = within(column("未習得")).getByText("期限: 2026-09-10(期限切れ)");
    expect(overdue).toHaveClass("due", "overdue");
    expect(screen.getAllByText(/期限切れ/)).toHaveLength(1);
  });

  it("習得済みのスキルは、期限を過ぎていても、期限切れにしない", () => {
    const skills = [makeSkill({ id: 1, status: "mastered", dueDate: "2026-01-01", acquiredOn: "2026-02-01" })];

    render(<Board initialSkills={skills} today={TODAY} />);

    expect(screen.queryByText(/期限切れ/)).not.toBeInTheDocument();
    expect(screen.getByText("期限: 2026-01-01")).not.toHaveClass("overdue");
  });

  it("「今日」が変わると、期限切れの判定も変わる(期限が今日なら、期限切れではない)", () => {
    const skills = [makeSkill({ id: 1, dueDate: "2026-09-20" })];

    const { rerender } = render(<Board initialSkills={skills} today="2026-09-20" />);
    expect(screen.queryByText(/期限切れ/)).not.toBeInTheDocument();

    rerender(<Board initialSkills={skills} today="2026-09-21" />);
    expect(screen.getByText(/期限切れ/)).toBeInTheDocument();
  });

  it("ポイント・考察があれば表示し、なければ表示しない", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(screen.getByText("手順書を先に読む。")).toHaveClass("note");
    const card = screen.getByRole("heading", { name: "クレーム対応" }).closest("article")!;
    expect(card.querySelector(".note")).toBeNull();
  });

  it("スキルがない列には、「スキルがありません」と表示する", () => {
    const withoutMastered = sampleSkills().filter((skill) => skill.status !== "mastered");

    render(<Board initialSkills={withoutMastered} today={TODAY} />);

    expect(within(column("習得済み")).getByText("スキルがありません")).toBeInTheDocument();
    expect(within(column("習得済み")).getByTitle("スキルの件数")).toHaveTextContent("0");
    expect(within(column("未習得")).queryByText("スキルがありません")).not.toBeInTheDocument();
  });

  it("スキルが1件もなくても、3つの列を表示する", () => {
    render(<Board initialSkills={[]} today={TODAY} />);

    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(screen.getAllByText("スキルがありません")).toHaveLength(3);
  });

  it("スキル名やポイントに HTML が含まれていても、文字としてそのまま表示する(HTML として解釈しない)", () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const skills = [makeSkill({ id: 1, name: evil, note: "<b>太字</b>" })];

    const { container } = render(<Board initialSkills={skills} today={TODAY} />);

    expect(screen.getByRole("heading", { name: evil })).toBeInTheDocument();
    expect(screen.getByText("<b>太字</b>")).toBeInTheDocument();
    expect(container.querySelector("img, script, b")).toBeNull();
  });

  it("並び順が配列の順番と違っても、並び順の順に表示する", () => {
    const skills = [
      makeSkill({ id: 1, name: "後", position: 1 }),
      makeSkill({ id: 2, name: "先", position: 0 }),
    ];

    render(<Board initialSkills={skills} today={TODAY} />);

    const names = within(column("未習得")).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["先", "後"]);
  });
});

describe("LoadError(取得に失敗したときの表示)", () => {
  const API_URL = "http://localhost:3001";

  it("渡された文章と、確かめることを、警告として表示する", () => {
    render(<LoadError message="テスト用の文章" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("スキルを取得できませんでした");
    expect(alert).toHaveTextContent("テスト用の文章");
    expect(alert).toHaveTextContent("バックエンド(API)が動いているかを確かめてから、ページを再読み込みしてください。");
  });

  describe("loadErrorMessage(原因に合わせた文章)", () => {
    it("API がエラーを返したときは、ステータスとメッセージ", () => {
      const message = loadErrorMessage(new ApiError(500, { base: ["サーバーで問題が起きました。"] }), API_URL);

      expect(message).toBe("API がエラーを返しました(HTTP 500)。サーバーで問題が起きました。");
    });

    it("メッセージがないエラーでも、ステータスを伝える", () => {
      expect(loadErrorMessage(new ApiError(502, {}), API_URL)).toBe("API がエラーを返しました(HTTP 502)。");
    });

    it("API に接続できなかったときは、API の場所を伝える", () => {
      expect(loadErrorMessage(new TypeError("fetch failed"), API_URL)).toBe("API(http://localhost:3001)に接続できませんでした。");
    });

    it("API が、時間内に返事をしなかったときは、そう伝える", () => {
      const timeout = new DOMException("The operation timed out.", "TimeoutError");

      expect(loadErrorMessage(timeout, API_URL)).toBe("API(http://localhost:3001)から、時間内に返事がありませんでした。");
    });

    it("原因が分からない例外(Error でないもの)でも、接続できなかったと伝える", () => {
      expect(loadErrorMessage("なにか", API_URL)).toBe("API(http://localhost:3001)に接続できませんでした。");
    });
  });
});

// ---------- スキルの追加(ボード全体の流れ) ----------

afterEach(() => {
  vi.unstubAllGlobals();
});

// API の返事を、模擬する。Response なら、その返事を返す。それ以外(例外)なら、通信に失敗した(reject)ことにする
function stubFetch(response: Response | unknown) {
  const fetchMock = response instanceof Response ? vi.fn().mockResolvedValue(response) : vi.fn().mockRejectedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// 「作られたスキル」の、API の返事(201)
function createdResponse(overrides: Partial<ReturnType<typeof makeSkill>> = {}): Response {
  const skill = makeSkill({ id: 99, name: "新しいスキル", status: "unlearned", position: 3, ...overrides });
  return new Response(JSON.stringify(toApiSkill(skill)), { status: 201, headers: { "Content-Type": "application/json" } });
}

const cardNames = (name: string) =>
  within(column(name)).queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

describe("Board: スキルの追加", () => {
  it("未習得の「+ スキルを追加」を押すと、追加フォーム(見出しに、追加先の列の名前)が開く", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));

    expect(screen.getByRole("dialog", { name: "スキルを追加(未習得)" })).toBeInTheDocument();
  });

  it("習得中の「+ スキルを追加」では、見出しが「習得中」になる", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("習得中")).getByRole("button", { name: "+ スキルを追加" }));

    expect(screen.getByRole("dialog", { name: "スキルを追加(習得中)" })).toBeInTheDocument();
  });

  it("入力して保存すると、API に追加して、その列の末尾にカードが増え、件数が変わり、フォームが閉じる", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(createdResponse());
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "新しいスキル");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作", "新しいスキル"]); // 末尾
    expect(within(column("未習得")).getByTitle("スキルの件数")).toHaveTextContent("4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("API には、追加先の状態(status)と、入力した内容を、API の項目名で送る", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(createdResponse({ status: "learning", position: 2 }));
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("習得中")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "新しいスキル");
    await user.selectOptions(screen.getByLabelText("優先度"), "low");
    await user.type(screen.getByLabelText("ポイント・考察"), "メモ");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/v1/skills");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      name: "新しいスキル", note: "メモ", status: "learning", priority: "low", due_date: null,
    });
  });

  it("習得中の列に追加すると、習得中の列の末尾に増える(ほかの列は、変わらない)", async () => {
    const user = userEvent.setup();
    stubFetch(createdResponse({ name: "習得中の新規", status: "learning", position: 2 }));
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("習得中")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "習得中の新規");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(cardNames("習得中")).toEqual(["請求書の発行", "月次レポートの作成", "習得中の新規"]));
    expect(cardNames("未習得")).toHaveLength(3);
    expect(cardNames("習得済み")).toEqual(["レジ締め"]);
  });

  it("追加したカードは、習得日を出さず、優先度・期限も表示される", async () => {
    const user = userEvent.setup();
    stubFetch(createdResponse({ priority: "high", dueDate: "2026-12-01" }));
    render(<Board initialSkills={[]} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "新しいスキル");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const card = (await screen.findByRole("heading", { name: "新しいスキル" })).closest("article")!;
    expect(within(card).getByText("優先度: 高")).toBeInTheDocument();
    expect(within(card).getByText("期限: 2026-12-01")).toBeInTheDocument();
    expect(within(card).queryByText(/習得日/)).not.toBeInTheDocument();
    expect(within(column("未習得")).queryByText("スキルがありません")).not.toBeInTheDocument(); // 空の列に、追加した
  });

  it("追加のあと、もう一度開くと、前の入力は残っていない", async () => {
    const user = userEvent.setup();
    stubFetch(createdResponse());
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    const addButton = within(column("未習得")).getByRole("button", { name: "+ スキルを追加" });
    await user.click(addButton);
    await user.type(screen.getByLabelText(/スキル名/), "新しいスキル");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(addButton);

    expect(screen.getByLabelText(/スキル名/)).toHaveValue("");
  });

  it("スキル名が空のまま保存すると、通信せず、フォームに、エラーを出す(カードも増えない)", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(createdResponse());
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("スキル名を入力してください。")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // 開いたまま
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cardNames("未習得")).toHaveLength(3);
  });

  it("サーバーが 422 を返したら、その項目の下にメッセージを出す。フォームは開いたまま、カードも増えない", async () => {
    const user = userEvent.setup();
    stubFetch(new Response(JSON.stringify({ errors: { name: ["スキル名は100文字以内で入力してください"] } }), { status: 422 }));
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "サーバーが断るスキル");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("スキル名は100文字以内で入力してください")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/スキル名/)).toHaveValue("サーバーが断るスキル");
    expect(cardNames("未習得")).toHaveLength(3);
  });

  it("API に接続できなかったら、フォームの上に、エラーを出す(入力は残る)", async () => {
    const user = userEvent.setup();
    stubFetch(new TypeError("fetch failed"));
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "新しいスキル");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/API に接続できませんでした/)).toBeInTheDocument();
    expect(screen.getByLabelText(/スキル名/)).toHaveValue("新しいスキル");
    expect(cardNames("未習得")).toHaveLength(3);
  });

  it("キャンセルすると、通信せず、閉じる(カードも増えない)", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(createdResponse());
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(within(column("未習得")).getByRole("button", { name: "+ スキルを追加" }));
    await user.type(screen.getByLabelText(/スキル名/), "やめたスキル");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cardNames("未習得")).toHaveLength(3);
  });

  it("習得済みの列には、追加ボタンがない(習得済みには、直接追加できない)", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(within(column("習得済み")).queryByRole("button", { name: "+ スキルを追加" })).not.toBeInTheDocument();
  });
});
