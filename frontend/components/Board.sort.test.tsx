import type { DndContextProps } from "@dnd-kit/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { sortByPriority } from "@/lib/board";
import { makeSkill, sampleSkills, toApiSkill } from "@/lib/fixtures";

// ドラッグ中は並べ替えできないことを確かめるため、DndContext の設定(ドラッグの各場面の関数)を、テストから呼べるようにする
const captured = vi.hoisted(() => ({ props: null as unknown }));
vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  const React = await import("react");
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      captured.props = props;
      return React.createElement(actual.DndContext, props);
    },
  };
});
const dnd = () => captured.props as Required<Pick<DndContextProps, "onDragStart" | "onDragCancel">> & DndContextProps;

const TODAY = "2026-09-20";
const column = (name: string) => screen.getByRole("region", { name });
const sortButton = (name: string) => within(column(name)).getByRole("button", { name: "優先度順" });
const cardNames = (name: string) =>
  within(column(name)).queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// 本物のサーバーと同じ返事: 並べ替えたあとの、その列のスキル(並び順の順)
function sortedResponse(status: "unlearned" | "learning") {
  const column = sortByPriority(sampleSkills(), status)
    .filter((skill) => skill.status === status)
    .sort((a, b) => a.position - b.position);
  return jsonResponse(column.map(toApiSkill));
}

function pending() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board: 優先度順の並べ替え", () => {
  it("未習得の「優先度順」を押すと、API に送り、高 → 中 → 低の順に並ぶ。ほかの列は変わらない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sortedResponse("unlearned"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]); // 低・中・高

    await user.click(sortButton("未習得"));

    await waitFor(() => expect(cardNames("未習得")).toEqual(["受発注システムの操作", "発注書の確認", "クレーム対応"])); // 高・中・低
    expect(cardNames("習得中")).toEqual(["請求書の発行", "月次レポートの作成"]);
    expect(cardNames("習得済み")).toEqual(["レジ締め"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/api/v1/skills/sort");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ status: "unlearned" });
  });

  it("習得中の「優先度順」は、習得中だけを並べ替える", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sortedResponse("learning"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(sortButton("習得中"));

    await waitFor(() => expect(cardNames("習得中")).toEqual(["月次レポートの作成", "請求書の発行"])); // 高・中
    expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: "learning" });
  });

  it("並び順は、サーバーの返事に従う(画面側で決めた順番ではない)", async () => {
    // サーバーが、画面の予想と違う順番を返したら、サーバーの順番になる
    const custom = [3, 1, 2].map((id) => toApiSkill({ ...sampleSkills().find((skill) => skill.id === id)!, position: [3, 1, 2].indexOf(id) }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(custom)));
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(sortButton("未習得"));

    await waitFor(() => expect(cardNames("未習得")).toEqual(["受発注システムの操作", "クレーム対応", "発注書の確認"]));
  });

  it("サーバーの返事に、別の場所で追加されたスキルが入っていれば、それも列に出る(サーバーの状態に合わせる)", async () => {
    const added = toApiSkill(makeSkill({ id: 50, name: "別の場所で追加", status: "unlearned", priority: "high", position: 0 }));
    const rest = sortByPriority(sampleSkills(), "unlearned")
      .filter((skill) => skill.status === "unlearned")
      .map((skill) => toApiSkill({ ...skill, position: skill.position + 1 }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([added, ...rest])));
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(sortButton("未習得"));

    await waitFor(() => expect(cardNames("未習得")).toHaveLength(4));
    expect(cardNames("未習得")[0]).toBe("別の場所で追加");
  });

  describe("押せる・押せない", () => {
    it("スキルが2件未満の列では、押せない(説明を出す)。2件以上で、押せる", () => {
      const skills = [
        makeSkill({ id: 1, status: "unlearned", position: 0 }), // 未習得は1件
        makeSkill({ id: 2, status: "mastered", position: 0 }), // 習得中は0件
      ];
      render(<Board initialSkills={skills} today={TODAY} />);

      expect(sortButton("未習得")).toBeDisabled();
      expect(sortButton("未習得")).toHaveAttribute("title", "スキルが2件以上あると、並べ替えできます");
      expect(sortButton("習得中")).toBeDisabled();
    });

    it("2件以上の列では、押せて、説明が出る", () => {
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      expect(sortButton("未習得")).toBeEnabled();
      expect(sortButton("未習得")).toHaveAttribute("title", "優先度の高い順(高 → 中 → 低)に並べ替えます");
    });

    it("スキルが1件になった(削除した)ら、押せなくなる", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
      const user = userEvent.setup();
      const skills = [makeSkill({ id: 1, status: "learning", position: 0 }), makeSkill({ id: 2, status: "learning", position: 1 })];
      render(<Board initialSkills={skills} today={TODAY} />);
      expect(sortButton("習得中")).toBeEnabled();

      await user.click(within(column("習得中")).getByRole("button", { name: "「スキル1」を削除" }));
      await user.click(within(screen.getByRole("dialog", { name: "「スキル1」を削除しますか?" })).getByRole("button", { name: "削除" }));

      await waitFor(() => expect(sortButton("習得中")).toBeDisabled());
    });
  });

  describe("通信中と、二重の操作", () => {
    it("通信中は、どちらの列のボタンも押せない。終わると、押せる", async () => {
      const call = pending();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(call.promise));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      fireEvent.click(sortButton("未習得"));

      await waitFor(() => expect(sortButton("未習得")).toBeDisabled());
      expect(sortButton("習得中")).toBeDisabled();

      call.resolve(sortedResponse("unlearned"));
      await waitFor(() => expect(sortButton("習得中")).toBeEnabled());
      expect(sortButton("未習得")).toBeEnabled();
    });

    it("同じ瞬間に2回押されても、通信は1回だけ", async () => {
      const call = pending();
      const fetchMock = vi.fn().mockReturnValue(call.promise);
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);
      const button = sortButton("未習得");

      // 1つの act の中で、2回押す(画面が更新される前の、2回目。ボタンは、まだ押せる状態のまま)
      act(() => {
        button.click();
        button.click();
      });
      call.resolve(sortedResponse("unlearned"));

      await waitFor(() => expect(sortButton("未習得")).toBeEnabled());
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("並べ替えの通信中は、カードをつかめない(ドラッグが始まらない)", async () => {
      const call = pending();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(call.promise));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      fireEvent.click(sortButton("未習得"));
      await waitFor(() => expect(sortButton("未習得")).toBeDisabled());
      act(() => dnd().onDragStart({ active: { id: 2, rect: { current: { initial: null, translated: null } } } } as never));

      // ドラッグが始まっていれば、置き場所の強調(drop-target)が付く
      expect(column("未習得")).not.toHaveClass("drop-target");
      call.resolve(sortedResponse("unlearned"));
      await waitFor(() => expect(sortButton("未習得")).toBeEnabled());
    });

    it("ドラッグ中は、押せない。やめると、押せる", () => {
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      act(() => dnd().onDragStart({ active: { id: 2, rect: { current: { initial: null, translated: null } } } } as never));
      expect(sortButton("未習得")).toBeDisabled();
      expect(sortButton("習得中")).toBeDisabled();

      act(() => dnd().onDragCancel({} as never));
      expect(sortButton("未習得")).toBeEnabled();
    });
  });

  describe("失敗したとき", () => {
    it.each([
      ["サーバーのエラー(500)", () => vi.fn().mockResolvedValue(jsonResponse({}, 500)), "並べ替えできませんでした"],
      ["接続できない", () => vi.fn().mockRejectedValue(new TypeError("fetch failed")), "API に接続できませんでした"],
      [
        "習得済みなどで、422",
        () => vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["習得済みの列は、優先度順に並べ替えできません。"] } }, 422)),
        "習得済みの列は、優先度順に並べ替えできません。",
      ],
    ])("%s: 画面はそのままで、エラーを出し、もう一度押せる", async (_name, makeFetch, expected) => {
      vi.stubGlobal("fetch", makeFetch());
      const user = userEvent.setup();
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      await user.click(sortButton("未習得"));

      const notice = await screen.findByRole("alert", { name: "お知らせ" });
      expect(notice).toHaveTextContent("「未習得」を優先度順に並べ替えできませんでした。");
      expect(notice).toHaveTextContent(expected);
      expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]); // 変わらない
      expect(sortButton("未習得")).toBeEnabled();
    });

    it("そのあと、成功したら、エラーは消える", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(sortedResponse("unlearned"));
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      await user.click(sortButton("未習得"));
      await screen.findByRole("alert", { name: "お知らせ" });
      await user.click(sortButton("未習得"));

      await waitFor(() => expect(screen.queryByRole("alert", { name: "お知らせ" })).not.toBeInTheDocument());
      expect(cardNames("未習得")[0]).toBe("受発注システムの操作");
    });
  });

  it("並べ替えのあとも、ドラッグを始められる(ドラッグ用の並びが壊れていない)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sortedResponse("unlearned")));
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    await user.click(sortButton("未習得"));
    await waitFor(() => expect(cardNames("未習得")[0]).toBe("受発注システムの操作"));

    // 並べ替えで、ドラッグ用の並びが壊れていない(ドラッグを始められる)
    act(() => dnd().onDragStart({ active: { id: 2, rect: { current: { initial: null, translated: null } } } } as never));
    expect(column("未習得")).toHaveClass("drop-target");
    act(() => dnd().onDragCancel({} as never));
  });
});
