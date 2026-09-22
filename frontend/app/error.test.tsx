import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import Loading from "@/app/loading";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app/error.tsx(予期しないエラーのときの画面)", () => {
  it("日本語の案内を、警告として表示する", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ErrorPage error={new Error("壊れた")} retry={() => {}} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("画面の表示中に、エラーが起きました");
    expect(alert).toHaveTextContent("保存済みのスキルは、失われていません");
  });

  it("「再読み込み」を押すと、retry を呼ぶ(取得と表示を、やり直す)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<ErrorPage error={new Error("壊れた")} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("原因を調べられるように、エラーをコンソールに残す", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("壊れた");

    render(<ErrorPage error={error} retry={() => {}} />);

    expect(spy).toHaveBeenCalledWith(error);
  });

  it("main のランドマークが残る(role=\"alert\" は、main を上書きしない)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ErrorPage error={new Error("壊れた")} retry={() => {}} />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("alert")).toBeInTheDocument();
  });
});

describe("app/loading.tsx(読み込み中の画面)", () => {
  it("「読み込み中」を、状態として表示する", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent("読み込み中…");
  });

  it("main のランドマークが残る(role=\"status\" は、main を上書きしない)", () => {
    render(<Loading />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("status")).toBeInTheDocument();
  });
});
