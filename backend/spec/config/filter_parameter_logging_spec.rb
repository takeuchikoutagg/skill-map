require "rails_helper"

# ポイント・考察(note)は、自由記述で、個人の学習メモが入りうる。ログに、全文が残らないようにする(config/initializers/filter_parameter_logging.rb)
RSpec.describe "ログのフィルター設定" do
  # 実際の動きで確かめる(config.filter_parameters は、リクエストのログ出力で使われると、
  # 個々の項目名の配列から、まとめた正規表現へ、内部で作り替えられることがある。ほかのテストが先に
  # リクエストを送ったかどうかで、見た目が変わってしまうため、「note を渡すと隠れるか」を、直接確かめる)
  it "note の中身は、ログに出さない項目として、[FILTERED] に置き換わる" do
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)

    filtered = filter.filter({ "note" => "他人に見られたくない、学習の記録" })

    expect(filtered["note"]).to eq("[FILTERED]")
  end
end
