require "rails_helper"

# 習得日はサーバーの日付で記録する(docs/02-機能要件.md の F-06)。
# 日本の日付になるよう、タイムゾーンは Tokyo にしてある。
RSpec.describe "タイムゾーン" do
  it "Rails のタイムゾーンは Tokyo" do
    expect(Time.zone.name).to eq("Tokyo")
  end

  it "Date.current は日本時間の日付になる(UTC の 15:00 は、日本では翌日の 0:00)" do
    travel_to Time.utc(2026, 9, 19, 15, 0, 0) do
      expect(Date.current).to eq(Date.new(2026, 9, 20))
    end
  end
end
