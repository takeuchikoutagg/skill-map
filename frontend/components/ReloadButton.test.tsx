import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReloadButton } from "@/components/ReloadButton";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReloadButton", () => {
  it("「再読み込み」を押すと、ページを読み込み直す", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<ReloadButton />);

    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
