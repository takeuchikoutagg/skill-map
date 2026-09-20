// テストの前に、いつも読み込む設定。
import "@testing-library/jest-dom/vitest"; // toBeInTheDocument() など、画面の部品を確かめる書き方を使えるようにする
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// テストが1つ終わるたびに、画面に表示した部品を片付ける(前のテストの表示が、次のテストに残らないようにする)。
// Vitest を globals なしで使うときは、Testing Library の自動の片付けが動かないので、ここで明示する。
afterEach(() => {
  cleanup();
});
