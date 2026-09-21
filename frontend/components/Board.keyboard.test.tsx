// 本物の @dnd-kit を使って、キーボード操作(Space でつかむ → 矢印で動かす → Space で置く)が、最後まで動くかを確かめる。
// Board.drag.test.tsx は、@dnd-kit を模擬して、判定のあとの処理を細かく確かめている。こちらは、@dnd-kit と Board の「つなぎ目」を確かめる。
// マウスのドラッグは、jsdom では、正確に再現できない(ブラウザで、確認する)。
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { moveSkill } from "@/lib/board";
import { sampleSkills, toApiSkill } from "@/lib/fixtures";
import type { Status } from "@/lib/types";

const TODAY = "2026-09-20";

type Rectangle = () => DOMRect;
type WithRect = Element & { __rect?: Rectangle };

function rectOf(left: number, top: number, width: number, height: number): Rectangle {
  return () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
}

// jsdom には、配置の計算がない(要素の位置と大きさが、すべて 0 になる)。そこで、要素の四角を、こちらで決めて、渡す。
const original = Element.prototype.getBoundingClientRect;
let overlayRect: DOMRect | null = null; // ドラッグ中のコピー(DragOverlay)は、つかんだカードと同じ四角にする

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const element = this as WithRect;
    if (element.__rect) return element.__rect();
    const isOverlay = element.classList?.contains("overlay") || element.firstElementChild?.classList?.contains("overlay");
    if (overlayRect && isOverlay) return overlayRect;
    return original.call(this);
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = original;
});

afterEach(() => {
  overlayRect = null;
  vi.unstubAllGlobals();
});

// 3つの列を横に並べ、カードを縦に並べる
function layout() {
  (["未習得", "習得中", "習得済み"] as const).forEach((name, column) => {
    const region = screen.getByRole("region", { name }) as WithRect;
    region.__rect = rectOf(column * 320, 0, 300, 600);
    region.querySelectorAll("article.card").forEach((card, row) => {
      (card as WithRect).__rect = rectOf(column * 320 + 10, 60 + row * 100, 280, 90);
    });
  });
}

// 本物のサーバーと同じ結果を返す、API の模擬(移動の結果は、moveSkill で作る)
function stubMoveApi() {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const id = Number(/skills\/(\d+)\/move/.exec(url)?.[1]);
    const { status, position } = JSON.parse(init.body as string) as { status: Status; position: number };
    const moved = moveSkill(sampleSkills(), id, status, position, TODAY).find((skill) => skill.id === id)!;
    return new Response(JSON.stringify(toApiSkill(moved)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const column = (name: string) => screen.getByRole("region", { name });

const titlesIn = (name: string) =>
  Array.from(screen.getByRole("region", { name }).querySelectorAll("h3")).map((heading) => heading.textContent);

// 少し待つ(@dnd-kit の、判定と再描画が、終わるまで)
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 60))));

// カードにフォーカスして、Space でつかむ
async function grab(user: ReturnType<typeof userEvent.setup>, name: string) {
  const card = screen.getByRole("heading", { name }).closest("article") as WithRect & HTMLElement;
  overlayRect = card.__rect!();
  card.focus();
  await user.keyboard(" ");
  await settle();
}

const liveText = () => document.querySelector('[id^="DndLiveRegion"]')?.textContent;

describe("キーボードで、カードを動かす(本物の @dnd-kit)", () => {
  it("Space でつかみ、→ で右の列の上へ動かし、Space で置くと、その列に移り、API に送る", async () => {
    const user = userEvent.setup();
    const fetchMock = stubMoveApi();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    layout();

    await grab(user, "発注書の確認");
    expect(liveText()).toContain("発注書の確認");

    await user.keyboard("{ArrowRight}");
    await settle();
    expect(liveText()).toContain("「月次レポートの作成」");
    expect(titlesIn("習得中")).toContain("発注書の確認"); // 動かしている途中で、もう、この列に見えている

    await user.keyboard(" ");
    await settle();
    expect(liveText()).toContain("置きました");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/skills\/2\/move$/);
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ status: "learning", position: 2 });

    // 置いたあとも、フォーカスは、移したカードに残る(キーボードの人が、位置を見失わない)
    expect(document.activeElement).toBe(within(column("習得中")).getByRole("heading", { name: "発注書の確認" }).closest("article"));
    // サーバーの返事のあとも、その列にいる。元の列からは、なくなる
    expect(titlesIn("習得中")).toEqual(["請求書の発行", "月次レポートの作成", "発注書の確認"]);
    expect(titlesIn("未習得")).toEqual(["クレーム対応", "受発注システムの操作"]);
  });

  it("Esc でやめると、元の位置に戻り、API には送らない", async () => {
    const user = userEvent.setup();
    const fetchMock = stubMoveApi();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    layout();

    await grab(user, "発注書の確認");
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(titlesIn("習得中")).toContain("発注書の確認");

    await user.keyboard("{Escape}");
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(titlesIn("習得中")).toEqual(["請求書の発行", "月次レポートの作成"]);
    expect(titlesIn("未習得")).toEqual(["クレーム対応", "発注書の確認", "受発注システムの操作"]);
    // やめたあとも、フォーカスは、そのカードに残る
    expect(document.activeElement).toBe(within(column("未習得")).getByRole("heading", { name: "発注書の確認" }).closest("article"));
  });
});
