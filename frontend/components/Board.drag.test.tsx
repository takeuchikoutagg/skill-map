import type { DndContextProps } from "@dnd-kit/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { columnDropId } from "@/lib/drag";
import { makeSkill, sampleSkills, toApiSkill } from "@/lib/fixtures";

// @dnd-kit の DndContext に渡された設定(ドラッグの各場面で呼ばれる関数)を、テストから呼べるように、覚えておく。
// 実際のマウス操作は、jsdom(テスト用の簡易ブラウザ)では再現できないので、ドラッグの各場面の関数を、直接呼んで確かめる。
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

const dnd = () => captured.props as Required<Pick<DndContextProps, "onDragStart" | "onDragOver" | "onDragEnd" | "onDragCancel">> & DndContextProps;

// ドラッグの各場面で、@dnd-kit が渡してくる、イベントのまね
const active = (id: number) => ({ id, rect: { current: { initial: null, translated: null } } });
const over = (id: number | string) => ({ id, rect: { top: 100, left: 0, width: 200, height: 80, bottom: 180, right: 200 } });

const start = (id: number) => act(() => dnd().onDragStart({ active: active(id) } as never));
const hover = (id: number, overId: number | string) => act(() => dnd().onDragOver({ active: active(id), over: over(overId) } as never));
const drop = (id: number, overId: number | string | null) =>
  act(() => dnd().onDragEnd({ active: active(id), over: overId === null ? null : over(overId) } as never));
const cancel = () => act(() => dnd().onDragCancel({} as never));

const TODAY = "2026-09-20";
const column = (name: string) => screen.getByRole("region", { name });
const cardNames = (name: string) =>
  within(column(name)).queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
const count = (name: string) => within(column(name)).getByTitle("スキルの件数").textContent;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// 移動 API の返事: 移動後のスキル(サーバーが決めた値)
function movedResponse(id: number, changes: Partial<ReturnType<typeof makeSkill>>) {
  const base = sampleSkills().find((skill) => skill.id === id)!;
  return jsonResponse(toApiSkill({ ...base, ...changes }));
}

// 終わるまで、返事を返さない通信(移動の途中の、画面の状態を確かめるため)
function pending() {
  let resolve: (response: Response) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board: ドラッグ&ドロップ", () => {
  describe("列間の移動", () => {
    it("別の列のカードの上に落とすと、その位置に入る。先に画面が変わり、そのあと API に送る", async () => {
      const call = pending();
      const fetchMock = vi.fn().mockReturnValue(call.promise);
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2); // 未習得の「発注書の確認」をつかむ
      hover(2, 4); // 習得中の「請求書の発行」の上へ
      drop(2, 2); // 場所を空けた位置(自分自身の上)で、手を離す

      // 通信の返事を待たずに、画面は、もう変わっている(先に更新)
      expect(cardNames("習得中")).toEqual(["発注書の確認", "請求書の発行", "月次レポートの作成"]);
      expect(cardNames("未習得")).toEqual(["クレーム対応", "受発注システムの操作"]);
      expect(count("習得中")).toBe("3");
      expect(count("未習得")).toBe("2");
      // API には、移動先の状態と位置(移動したあとの位置)を送る
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://localhost:3001/api/v1/skills/2/move");
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body as string)).toEqual({ status: "learning", position: 0 });

      call.resolve(movedResponse(2, { status: "learning", position: 0 }));
      await waitFor(() => expect(cardNames("習得中")).toEqual(["発注書の確認", "請求書の発行", "月次レポートの作成"]));
    });

    it("相手のカードの真ん中より下で重なると、その後ろに入る", async () => {
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(2, { status: "learning", position: 1 }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      act(() =>
        dnd().onDragOver({
          active: { id: 2, rect: { current: { initial: null, translated: { top: 160, left: 0, width: 200, height: 80, bottom: 240, right: 200 } } } },
          over: over(4), // 相手は、top 100・height 80(真ん中は 140)。ドラッグ中のカードの上端は 160 で、真ん中より下
        } as never),
      );
      drop(2, 2);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: "learning", position: 1 });
    });

    it("空の列に落とせる(列そのものの上に落とす)", async () => {
      const skills = sampleSkills().filter((skill) => skill.status !== "mastered"); // 習得済みが空
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(1, { status: "mastered", position: 0, acquiredOn: "2026-09-20" }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={skills} today={TODAY} />);

      start(1);
      hover(1, columnDropId("mastered"));
      drop(1, columnDropId("mastered"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: "mastered", position: 0 });
      expect(cardNames("習得済み")).toEqual(["クレーム対応"]);
      expect(within(column("習得済み")).queryByText("スキルがありません")).not.toBeInTheDocument();
    });

    it("どの列からどの列へも移動できる(習得済み → 未習得)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(6, { status: "unlearned", position: 1, acquiredOn: null }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(6);
      hover(6, 2);
      drop(6, 6);

      await waitFor(() => expect(cardNames("未習得")).toEqual(["クレーム対応", "レジ締め", "発注書の確認", "受発注システムの操作"]));
      expect(within(column("習得済み")).getByText("スキルがありません")).toBeInTheDocument();
    });
  });

  describe("列内の並び替え", () => {
    it("同じ列のカードの上に落とすと、その位置に動く", async () => {
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(1, { position: 2 }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(1);
      drop(1, 3); // 先頭の「クレーム対応」を、末尾の「受発注システムの操作」の位置へ

      expect(cardNames("未習得")).toEqual(["発注書の確認", "受発注システムの操作", "クレーム対応"]);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: "unlearned", position: 2 });
    });

    it("下から上へも動かせる", async () => {
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(3, { position: 0 }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(3);
      drop(3, 1);

      expect(cardNames("未習得")).toEqual(["受発注システムの操作", "クレーム対応", "発注書の確認"]);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });

    it("列そのものの上に落とすと、その列の末尾になる", async () => {
      const fetchMock = vi.fn().mockResolvedValue(movedResponse(1, { position: 2 }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(1);
      drop(1, columnDropId("unlearned"));

      expect(cardNames("未習得")).toEqual(["発注書の確認", "受発注システムの操作", "クレーム対応"]);
    });
  });

  describe("習得日", () => {
    it("習得済みへ移すと、先に今日の日付が出て、そのあと、サーバーが決めた日付に置き換わる", async () => {
      const call = pending();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(call.promise));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(3);
      hover(3, columnDropId("mastered"));
      drop(3, 3);

      // 通信の返事を待たずに、今日(画面の「今日」)の日付が出る
      expect(within(column("習得済み")).getAllByText(/習得日:/).map((e) => e.textContent)).toContain("習得日: 2026-09-20");

      // サーバーは、別の日付(日をまたいだ場合など)を決めた
      call.resolve(movedResponse(3, { status: "mastered", position: 1, acquiredOn: "2026-09-21" }));
      await waitFor(() => expect(within(column("習得済み")).getByText("習得日: 2026-09-21")).toBeInTheDocument());
      expect(within(column("習得済み")).queryByText("習得日: 2026-09-20")).not.toBeInTheDocument();
    });

    it("習得済みから出すと、習得日が消える", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(movedResponse(6, { status: "learning", position: 2, acquiredOn: null })));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);
      expect(screen.getByText("習得日: 2026-09-01")).toBeInTheDocument();

      start(6);
      hover(6, columnDropId("learning"));
      drop(6, 6);

      await waitFor(() => expect(screen.queryByText(/習得日:/)).not.toBeInTheDocument());
    });

    it("習得済みの中で並び替えても、習得日は変わらない", async () => {
      const skills = [
        makeSkill({ id: 1, name: "A", status: "mastered", acquiredOn: "2026-09-01", position: 0 }),
        makeSkill({ id: 2, name: "B", status: "mastered", acquiredOn: "2026-09-02", position: 1 }),
      ];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(toApiSkill({ ...skills[0], position: 1 }))));
      render(<Board initialSkills={skills} today={TODAY} />);

      start(1);
      drop(1, 2);

      await waitFor(() => expect(cardNames("習得済み")).toEqual(["B", "A"]));
      expect(screen.getByText("習得日: 2026-09-01")).toBeInTheDocument();
      expect(screen.getByText("習得日: 2026-09-02")).toBeInTheDocument();
    });
  });

  describe("移動しない場合", () => {
    it("元の場所に落とすと、何もしない(通信しない)", () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      drop(2, 2);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
    });

    it("置ける場所の外で離すと、元のまま(通信しない)。ドラッグ中の見た目も、元に戻る", () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, 4); // いったん、習得中に入る
      expect(cardNames("習得中")).toContain("発注書の確認");
      drop(2, null); // 場所の外で、離す

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cardNames("習得中")).toEqual(["請求書の発行", "月次レポートの作成"]);
      expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
    });

    it("キャンセル(Esc)すると、元のまま(通信しない)", () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, columnDropId("mastered"));
      cancel();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cardNames("習得済み")).toEqual(["レジ締め"]);
      expect(cardNames("未習得")).toHaveLength(3);
    });
  });

  describe("ドラッグ中の見た目", () => {
    it("別の列の上に来ると、その列に入って見え、元の列は減り、置かれる列の枠が強調される。離すと、元に戻る", () => {
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      expect(column("未習得")).toHaveClass("drop-target"); // つかんだ直後は、元の列が「置かれる列」
      hover(2, 5);

      expect(cardNames("習得中")).toContain("発注書の確認");
      expect(count("習得中")).toBe("3");
      expect(count("未習得")).toBe("2");
      expect(column("習得中")).toHaveClass("drop-target");
      expect(column("未習得")).not.toHaveClass("drop-target");

      cancel();

      expect(column("習得中")).not.toHaveClass("drop-target");
      expect(count("未習得")).toBe("3");
    });
  });

  describe("失敗したとき", () => {
    it("API に接続できなかったら、元の位置に戻して、エラーのお知らせを出す", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, 4);
      drop(2, 2);

      const notice = await screen.findByRole("alert", { name: "お知らせ" });
      expect(notice).toHaveTextContent("「発注書の確認」を移動できませんでした。元の位置に戻しました。");
      expect(notice).toHaveTextContent("API に接続できませんでした");
      expect(cardNames("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
      expect(cardNames("習得中")).toEqual(["請求書の発行", "月次レポートの作成"]);
    });

    it("習得済みへの移動に失敗したら、習得日も、元に戻る(出ていた日付が消える)", async () => {
      const call = pending();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(call.promise));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(3);
      hover(3, columnDropId("mastered"));
      drop(3, 3);
      expect(within(column("習得済み")).getAllByText(/習得日:/)).toHaveLength(2); // 先に、今日の日付が出ている

      call.reject(new TypeError("fetch failed"));

      await screen.findByRole("alert", { name: "お知らせ" });
      expect(within(column("習得済み")).getAllByText(/習得日:/)).toHaveLength(1);
      expect(cardNames("未習得")).toContain("受発注システムの操作");
    });

    it("API がエラー(500)を返したときも、元に戻して、そのメッセージを出す", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: { base: ["サーバーで問題が起きました。"] } }, 500)));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, 4);
      drop(2, 2);

      const notice = await screen.findByRole("alert", { name: "お知らせ" });
      expect(notice).toHaveTextContent("サーバーで問題が起きました。");
      expect(cardNames("未習得")).toContain("発注書の確認");
    });

    it("失敗したあとも、もう一度、ドラッグして移動できる", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(movedResponse(2, { status: "learning", position: 0 }));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);
      start(2);
      hover(2, 4);
      drop(2, 2);
      await screen.findByRole("alert", { name: "お知らせ" });

      start(2);
      hover(2, 4);
      drop(2, 2);

      await waitFor(() => expect(screen.queryByRole("alert", { name: "お知らせ" })).not.toBeInTheDocument()); // 新しい移動で、お知らせは消える
      await waitFor(() => expect(cardNames("習得中")).toContain("発注書の確認"));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("別の場所で、すでに削除されていた(404)ときは、最新を取り直して、お知らせを出す", async () => {
      const remaining = sampleSkills().filter((skill) => skill.id !== 2).map(toApiSkill);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404))
        .mockResolvedValueOnce(jsonResponse(remaining));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, 4);
      drop(2, 2);

      const notice = await screen.findByRole("status", { name: "お知らせ" });
      expect(notice).toHaveTextContent("「発注書の確認」は、すでに削除されていました。最新の状態に更新しました。");
      expect(cardNames("未習得")).toEqual(["クレーム対応", "受発注システムの操作"]); // 最新の一覧
      expect(cardNames("習得中")).toEqual(["請求書の発行", "月次レポートの作成"]);
    });

    it("404 で、最新を取り直せなかったときは、元に戻して、エラーを出す", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ errors: { base: ["指定されたスキルが見つかりません。"] } }, 404))
        .mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      start(2);
      hover(2, 4);
      drop(2, 2);

      const notice = await screen.findByRole("alert", { name: "お知らせ" });
      expect(notice).toHaveTextContent("元の位置に戻しました。");
      expect(cardNames("未習得")).toContain("発注書の確認");
    });
  });

  describe("移動の通信中", () => {
    it("通信中は、次のドラッグを受け付けない(二重に更新しない)", async () => {
      const call = pending();
      const fetchMock = vi.fn().mockReturnValue(call.promise);
      vi.stubGlobal("fetch", fetchMock);
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);
      start(2);
      hover(2, 4);
      drop(2, 2); // 1つ目の移動(通信中)

      start(3); // 通信中に、別のカードをつかもうとする
      hover(3, columnDropId("mastered"));
      drop(3, 3);

      expect(fetchMock).toHaveBeenCalledTimes(1); // 2つ目は、送られない
      expect(cardNames("未習得")).toEqual(["クレーム対応", "受発注システムの操作"]); // 受発注システムの操作は、動いていない
      expect(cardNames("習得済み")).toEqual(["レジ締め"]);

      call.resolve(movedResponse(2, { status: "learning", position: 0 }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });

    it("通信が終わると、カードは、またドラッグできる(ドラッグ不可の指定が、外れる)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(movedResponse(2, { status: "learning", position: 0 })));
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);
      start(2);
      hover(2, 4);
      drop(2, 2);
      await waitFor(() => expect(cardNames("習得中")).toContain("発注書の確認"));

      const fetchMock = vi.fn().mockResolvedValue(movedResponse(3, { status: "mastered", position: 1, acquiredOn: "2026-09-20" }));
      vi.stubGlobal("fetch", fetchMock);
      start(3);
      hover(3, columnDropId("mastered"));
      drop(3, 3);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
  });

  describe("設定", () => {
    it("マウスは、6px 以上動かしたときだけ、ドラッグになる(少し動かしただけなら、クリック=編集を開く)", () => {
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      const sensors = dnd().sensors as unknown as { sensor: { name?: string }; options: { activationConstraint?: { distance: number } } }[];
      const pointer = sensors.find((s) => s.options.activationConstraint);
      expect(pointer?.options.activationConstraint).toEqual({ distance: 6 });
      expect(sensors).toHaveLength(2); // マウス(ポインター)と、キーボード
    });

    it("読み上げ(スクリーンリーダー)の説明と、スキルの名前を入れた読み上げ文が、日本語で設定されている", () => {
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      const accessibility = dnd().accessibility!;
      expect(accessibility.screenReaderInstructions?.draggable).toContain("スペースキー");
      expect(accessibility.announcements?.onDragStart?.({ active: { id: 2 } } as never)).toBe("「発注書の確認」をつかみました。");
    });

    it("カードは、キーボードで(Tab で)フォーカスでき、つかめる。ただし、カード自体は、ボタンとは扱わない(中に、ボタンがあるため)", () => {
      render(<Board initialSkills={sampleSkills()} today={TODAY} />);

      const article = screen.getByRole("heading", { name: "発注書の確認" }).closest("article")!;
      expect(article).toHaveAttribute("tabindex", "0");
      expect(article).not.toHaveAttribute("role", "button");
      expect(article).not.toHaveAttribute("aria-roledescription");
      // つかみ方の説明: aria-describedby が指す要素が、実際に存在して、日本語の説明が入っている
      const describedBy = article.getAttribute("aria-describedby")!;
      expect(document.getElementById(describedBy)).toHaveTextContent("スペースキーで、スキルをつかみます。");
      expect(within(article).getAllByRole("button")).toHaveLength(2); // スキル名と削除
    });
  });
});
