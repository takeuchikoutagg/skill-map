import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page"; // "@/" の書き方(vitest.config.mts の alias)が、動くことも確かめる

// 動作確認用の、最小のテスト。テストの仕組み(Vitest + Testing Library)が動くことを確かめる。
describe("トップページ", () => {
  it("見出し「skill-map」が表示される", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "skill-map" })).toBeInTheDocument();
  });
});
