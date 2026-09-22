require "rails_helper"

# 同時の操作で、ロックを待ちきれなかった・デッドロックになったときの返事(503)。
# (実際にロックを待たせるテストは、spec/services/board_concurrency_spec.rb)
RSpec.describe "ロック待ち・デッドロックのときの返事", type: :request do
  let(:json_headers) { { "CONTENT_TYPE" => "application/json" } }
  let!(:skill) { Skill.create!(name: "A", status: :unlearned, position: 0) }

  requests = {
    "追加 (POST /skills)" => ->(ctx, id) { ctx.post "/api/v1/skills", params: { name: "B", status: "unlearned" }.to_json, headers: ctx.json_headers },
    "削除 (DELETE /skills/:id)" => ->(ctx, id) { ctx.delete "/api/v1/skills/#{id}" },
    "移動 (PATCH /skills/:id/move)" => ->(ctx, id) { ctx.patch "/api/v1/skills/#{id}/move", params: { status: "learning", position: 0 }.to_json, headers: ctx.json_headers },
    "並べ替え (POST /skills/sort)" => ->(ctx, id) { ctx.post "/api/v1/skills/sort", params: { status: "unlearned" }.to_json, headers: ctx.json_headers }
  }
  errors = {
    "ロック待ちの時間切れ" => ActiveRecord::LockWaitTimeout,
    "デッドロック" => ActiveRecord::Deadlocked
  }

  requests.each do |request_name, call|
    errors.each do |error_name, error_class|
      it "#{request_name}: #{error_name}のときは、503 と、API のエラーの形(errors.base)を返す" do
        allow(BoardLock).to receive(:synchronize).and_raise(error_class, "わざと起こした失敗")

        call.call(self, skill.id)

        expect(response).to have_http_status(:service_unavailable)
        expect(response.parsed_body).to eq("errors" => { "base" => [ "サーバーが混み合っています。少し待ってから、もう一度お試しください。" ] })
        expect(response.headers["Retry-After"]).to eq("1")
      end
    end
  end

  it "503 のとき、データは、何も変わらない(追加されない・削除されない)" do
    allow(BoardLock).to receive(:synchronize).and_raise(ActiveRecord::LockWaitTimeout, "わざと起こした失敗")

    post "/api/v1/skills", params: { name: "B", status: "unlearned" }.to_json, headers: json_headers
    delete "/api/v1/skills/#{skill.id}"

    expect(Skill.pluck(:name)).to eq([ "A" ])
  end
end
