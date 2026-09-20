import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { toFormErrors } from "@/lib/skill-form";

describe("toFormErrors(例外を、フォームに表示するエラーにする)", () => {
  it("422: API の項目名(due_date)を、フォームの項目名(dueDate)に対応させる", () => {
    const error = new ApiError(422, {
      name: ["スキル名を入力してください"],
      due_date: ["期限は不正な値です"],
      priority: ["優先度は high・medium・low のいずれかにしてください"],
      note: ["ポイント・考察は5000文字以内で入力してください"],
    });

    expect(toFormErrors(error)).toEqual({
      name: "スキル名を入力してください",
      dueDate: "期限は不正な値です",
      priority: "優先度は high・medium・low のいずれかにしてください",
      note: "ポイント・考察は5000文字以内で入力してください",
    });
  });

  it("同じ項目に、複数のメッセージがあるときは、つなげて表示する", () => {
    const error = new ApiError(422, { name: ["ひとつめ。", "ふたつめ。"] });

    expect(toFormErrors(error).name).toBe("ひとつめ。 ふたつめ。");
  });

  it("項目に結びつかないメッセージ(base)や、フォームにない項目(status)は、general にまとめる", () => {
    const error = new ApiError(422, {
      base: ["習得済みの列には、スキルを直接追加できません。"],
      status: ["状態は unlearned・learning・mastered のいずれかにしてください"],
    });

    expect(toFormErrors(error)).toEqual({
      general: "習得済みの列には、スキルを直接追加できません。 状態は unlearned・learning・mastered のいずれかにしてください",
    });
  });

  it("項目ごとのメッセージと、general が、両方あってもよい", () => {
    const error = new ApiError(422, { name: ["スキル名を入力してください"], base: ["ほかの問題"] });

    expect(toFormErrors(error)).toEqual({ name: "スキル名を入力してください", general: "ほかの問題" });
  });

  it("メッセージが1つもない ApiError は、HTTP のステータスを伝える", () => {
    expect(toFormErrors(new ApiError(500, {}))).toEqual({ general: "保存できませんでした(HTTP 500)。" });
  });

  it("時間切れは、時間内に返事がなかったと伝える(例外の名前で判断する)", () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");

    expect(toFormErrors(timeout).general).toContain("時間内に返事がありませんでした");
  });

  it("接続できなかった(fetch の失敗)ときは、バックエンドの確認を促す", () => {
    expect(toFormErrors(new TypeError("fetch failed")).general).toContain("API に接続できませんでした");
  });

  it("原因が分からない例外でも、壊れずに、接続できなかったと伝える", () => {
    expect(toFormErrors("なにか").general).toContain("API に接続できませんでした");
    expect(toFormErrors(null).general).toContain("API に接続できませんでした");
  });
});
