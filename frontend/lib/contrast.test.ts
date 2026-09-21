// 色の見分けやすさ(コントラスト比)を、globals.css の色から計算して、基準を割っていないことを確かめる。
// 基準は、WCAG 2.1 の AA: ふつうの文字は 4.5 以上、枠線などの部品は 3 以上。
// (無効なボタンの文字は、基準の対象外。)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

// :root の色の変数を、読み取る(例: --muted: #5a6775; → { muted: "#5a6775" })
function readColors(): Record<string, string> {
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
  const colors: Record<string, string> = {};
  for (const match of root.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) colors[match[1]] = match[2];
  return colors;
}
const color = readColors();

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("コントラスト比の計算", () => {
  it("白と黒は 21、同じ色は 1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("色の順番を入れ替えても、同じ", () => {
    expect(contrastRatio("#2563eb", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#2563eb"), 10);
  });

  it("globals.css から、色を読み取れている", () => {
    expect(color.muted).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(color).length).toBeGreaterThanOrEqual(15);
  });
});

describe("文字の色(4.5 以上)", () => {
  const cases: [string, string, string][] = [
    ["本文 / カード", "text", "surface"],
    ["本文 / 列の背景", "text", "list-bg"],
    ["薄い文字(期限・空の列の案内・追加ボタン)/ 列の背景", "muted", "list-bg"],
    ["薄い文字 / ページの背景", "muted", "bg"],
    ["薄い文字(期限・件数)/ カード・白いバッジ", "muted", "surface"],
    ["期限切れ・削除ボタン(赤)/ カード", "danger", "surface"],
    ["習得日(緑)/ カード", "done-accent", "surface"],
    ["「習得済み」の見出し(緑)/ 列の背景", "done-accent", "list-bg"],
    ["優先度 高", "high-text", "high-bg"],
    ["優先度 中", "mid-text", "mid-bg"],
    ["優先度 低", "low-text", "low-bg"],
    ["ボタンの文字(白)/ 青いボタン", "surface", "primary"],
    ["ボタンの文字(白)/ 赤いボタン", "surface", "danger"],
  ];

  it.each(cases)("%s", (_name, foreground, background) => {
    expect(contrastRatio(color[foreground], color[background])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("枠線などの部品の色(3 以上)", () => {
  it.each([
    ["フォーカスの枠(青)/ 列の背景", "primary", "list-bg"],
    ["フォーカスの枠(青)/ ページの背景", "primary", "bg"],
    ["フォーカスの枠(青)/ カード", "primary", "surface"],
  ])("%s", (_name, foreground, background) => {
    expect(contrastRatio(color[foreground], color[background])).toBeGreaterThanOrEqual(3);
  });
});
