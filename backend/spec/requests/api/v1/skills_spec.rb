require "rails_helper"

RSpec.describe "GET /api/v1/skills", type: :request do
  let(:json) { response.parsed_body }

  it "スキルがないときは、空の配列を返す" do
    get "/api/v1/skills"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("application/json")
    expect(json).to eq([])
  end

  it "スキルの項目を、決めた形で返す" do
    skill = Skill.create!(
      name: "請求書の発行",
      note: "締め日に注意する",
      status: :mastered,
      priority: :high,
      due_date: Date.new(2026, 10, 31),
      acquired_on: Date.new(2026, 9, 1),
      position: 0
    )

    get "/api/v1/skills"

    expect(json).to eq([
      {
        "id" => skill.id,
        "name" => "請求書の発行",
        "note" => "締め日に注意する",
        "status" => "mastered",
        "priority" => "high",
        "due_date" => "2026-10-31",
        "acquired_on" => "2026-09-01",
        "position" => 0
      }
    ])
  end

  it "期限や習得日がないスキルは、null で返す" do
    Skill.create!(name: "クレーム対応", position: 0)

    get "/api/v1/skills"

    expect(json.first).to include("note" => nil, "due_date" => nil, "acquired_on" => nil)
  end

  it "画面に要らない項目(作成日時・更新日時)は返さない" do
    Skill.create!(name: "x", position: 0)

    get "/api/v1/skills"

    expect(json.first.keys).to match_array(%w[id name note status priority due_date acquired_on position])
  end

  it "状態(未習得 → 習得中 → 習得済み)、同じ状態の中では並び順で返す" do
    Skill.create!(name: "習得済みA", status: :mastered, position: 0)
    Skill.create!(name: "未習得B", status: :unlearned, position: 1)
    Skill.create!(name: "習得中A", status: :learning, position: 0)
    Skill.create!(name: "未習得A", status: :unlearned, position: 0)

    get "/api/v1/skills"

    expect(json.map { |s| s["name"] }).to eq(%w[未習得A 未習得B 習得中A 習得済みA])
  end

  it "日本語や絵文字も、化けずに返す" do
    Skill.create!(name: "受発注システムの操作 😀", note: "𠮷野家", position: 0)

    get "/api/v1/skills"

    expect(json.first).to include("name" => "受発注システムの操作 😀", "note" => "𠮷野家")
  end

  it "フロントエンド(許可したオリジン)から呼べる" do
    get "/api/v1/skills", headers: { "Origin" => "http://localhost:3000" }

    expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
  end
end
