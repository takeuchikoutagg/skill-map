// アクセシビリティ(キーボードだけ・スクリーンリーダーでも使えるか)の確認。本物の @dnd-kit を使う。
// 色のコントラスト比は lib/contrast.test.ts。読み上げの実際の音声と、見た目は、jsdom では確かめられない(ブラウザで確認する)。
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { makeSkill, sampleSkills } from "@/lib/fixtures";

const TODAY = "2026-09-20";
const column = (name: string) => screen.getByRole("region", { name });
const cardOf = (name: string) => screen.getByRole("heading", { name }).closest("article") as HTMLElement;
const liveText = () => document.querySelector('[id^="DndLiveRegion"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("名前と構造", () => {
  it("すべてのボタンに、名前がある", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(10);
    for (const button of buttons) expect(button).toHaveAccessibleName(/\S/);
  });

  it("領域(ランドマーク)は、スキルボード(main)の中に、列(未習得・習得中・習得済み)が3つ。見出しで名前がついている", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const main = screen.getByRole("main", { name: "スキルボード" });
    const regions = within(main).getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-labelledby"))).toEqual(["list-unlearned", "list-learning", "list-mastered"]);
    expect(regions.map((region) => (region as HTMLElement).getAttribute("aria-label") ?? within(region).getByRole("heading", { level: 2 }).textContent)).toEqual(["未習得", "習得中", "習得済み"]);
  });

  it("見出しの階層は、列の名前(2)→ スキル名(3)。順番が飛ばない", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const levels = screen.getAllByRole("heading").map((heading) => Number(heading.tagName.slice(1)));
    expect(new Set(levels)).toEqual(new Set([2, 3]));
    expect(levels[0]).toBe(2);
  });

  it("件数は、「3件」と読まれる(数字だけにしない)", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(within(column("未習得")).getByTitle("スキルの件数")).toHaveTextContent("3件");
    expect(within(column("習得済み")).getByTitle("スキルの件数")).toHaveTextContent("1件");
  });

  it("列ごとに同じ名前のボタン(優先度順、スキルを追加)は、どの列のものかを、補足として読める", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    for (const name of ["未習得", "習得中"]) {
      expect(within(column(name)).getByRole("button", { name: "優先度順" })).toHaveAccessibleDescription(name);
      expect(within(column(name)).getByRole("button", { name: "+ スキルを追加" })).toHaveAccessibleDescription(name);
    }
  });

  it("削除ボタンは、どのスキルのものかが、名前で分かる", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(screen.getByRole("button", { name: "「クレーム対応」を削除" })).toBeInTheDocument();
  });

  it("カードは、キーボードで止まれて、つかみ方の説明が付いている", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    const card = cardOf("クレーム対応");
    expect(card).toHaveAttribute("tabindex", "0");
    expect(card).toHaveAccessibleDescription(/スペースキー/);
  });

  it("期限切れは、色だけでなく、文字(期限切れ)でも分かる", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    expect(screen.getByText("期限: 2026-09-10(期限切れ)")).toBeInTheDocument();
  });
});

describe("キーボードだけの操作", () => {
  it("Tab の順番: 優先度順 → 1枚目のカード → そのスキル名 → 削除 → 2枚目のカード…", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);
    const unlearned = column("未習得");
    const stops = () => document.activeElement;

    await user.tab();
    expect(stops()).toBe(within(unlearned).getByRole("button", { name: "優先度順" }));
    await user.tab();
    expect(stops()).toBe(cardOf("クレーム対応"));
    await user.tab();
    expect(stops()).toBe(within(cardOf("クレーム対応")).getByRole("button", { name: "クレーム対応" }));
    await user.tab();
    expect(stops()).toBe(screen.getByRole("button", { name: "「クレーム対応」を削除" }));
    await user.tab();
    expect(stops()).toBe(cardOf("発注書の確認"));
  });

  it("スキル名のボタンで Enter を押すと、編集フォームが開く(カードをつかまない)", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    within(cardOf("クレーム対応")).getByRole("button", { name: "クレーム対応" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "スキルを編集" })).toBeInTheDocument();
    expect(liveText()).not.toContain("つかみました");
  });

  it("削除ボタンで Space を押すと、削除の確認が開く(カードをつかまない)", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    screen.getByRole("button", { name: "「クレーム対応」を削除" }).focus();
    await user.keyboard(" ");

    expect(await screen.findByRole("dialog", { name: "「クレーム対応」を削除しますか?" })).toBeInTheDocument();
    expect(liveText()).not.toContain("つかみました");
  });

  it("カードそのものにフォーカスして Space を押すと、つかむ(読み上げ用の領域に、日本語で伝わる)", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    cardOf("クレーム対応").focus();
    await user.keyboard(" ");

    await waitFor(() => expect(liveText()).toContain("「クレーム対応」をつかみました。"));

    // つかんだまま終わらせない(つかんでいる間は、@dnd-kit が、画面全体のキー操作を受け持つので、次のテストに影響する)
    await user.keyboard("{Escape}");
    await waitFor(() => expect(liveText()).toContain("やめました"));
  });

  it("キーボードで削除すると、フォーカスは、その列の見出しに移る(ページの先頭に戻されない)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const user = userEvent.setup();
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    screen.getByRole("button", { name: "「クレーム対応」を削除" }).focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "「クレーム対応」を削除しますか?" });
    await user.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "クレーム対応" })).not.toBeInTheDocument());
    expect(document.activeElement).toBe(within(column("未習得")).getByRole("heading", { level: 2 }));
  });

  it("見出しは、Tab では止まらない(フォーカスを移せるだけ)", () => {
    render(<Board initialSkills={sampleSkills()} today={TODAY} />);

    for (const heading of screen.getAllByRole("heading", { level: 2 })) expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("スキルが1件もない列でも、追加ボタンは、キーボードで押せる", async () => {
    const user = userEvent.setup();
    render(<Board initialSkills={[makeSkill({ id: 1, status: "mastered", acquiredOn: "2026-09-01" })]} today={TODAY} />);

    within(column("習得中")).getByRole("button", { name: "+ スキルを追加" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "スキルを追加(習得中)" })).toBeInTheDocument();
  });
});
