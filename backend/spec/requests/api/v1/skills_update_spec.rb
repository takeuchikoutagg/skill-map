require "rails_helper"

RSpec.describe "PATCH /api/v1/skills/:id", type: :request do
  # 返事の中身。let ではなくメソッドにして、リクエストのたびに読み直す
  def json
    response.parsed_body
  end

  # 編集の対象にする、すべての項目が入ったスキル
  let!(:skill) do
    Skill.create!(
      name: "請求書の発行",
      note: "締め日に注意",
      status: :learning,
      priority: :medium,
      due_date: Date.new(2026, 10, 15),
      position: 3
    )
  end

  def patch_skill(id, params)
    patch "/api/v1/skills/#{id}", params: params, as: :json
  end

  describe "編集できる場合" do
    it "スキル名・ポイント・優先度・期限を更新でき、200 と更新後のスキルを返す" do
      patch_skill(skill.id, name: "請求書の発行(月次)", note: "月末は先輩に確認", priority: "high", due_date: "2026-11-30")

      expect(response).to have_http_status(:ok)
      expect(json).to include(
        "id" => skill.id,
        "name" => "請求書の発行(月次)",
        "note" => "月末は先輩に確認",
        "priority" => "high",
        "due_date" => "2026-11-30"
      )
      expect(skill.reload).to have_attributes(name: "請求書の発行(月次)", priority: "high", due_date: Date.new(2026, 11, 30))
    end

    it "一覧(GET)と同じ項目で返す" do
      patch_skill(skill.id, name: "x")

      expect(json.keys).to match_array(%w[id name note status priority due_date acquired_on position])
    end

    it "送った項目だけを更新し、送らなかった項目は変えない" do
      patch_skill(skill.id, priority: "low")

      expect(response).to have_http_status(:ok)
      expect(skill.reload).to have_attributes(
        name: "請求書の発行",
        note: "締め日に注意",
        priority: "low",
        due_date: Date.new(2026, 10, 15)
      )
    end

    it "ポイント・考察と期限は、null や空にして消せる" do
      patch_skill(skill.id, note: nil, due_date: nil)

      expect(json).to include("note" => nil, "due_date" => nil)
      expect(skill.reload).to have_attributes(note: nil, due_date: nil)

      patch_skill(skill.id, due_date: "")
      expect(response).to have_http_status(:ok)
    end

    it "スキル名の前後の空白は、全角スペースも含めて取り除く" do
      patch_skill(skill.id, name: "　請求書の発行 ")

      expect(json["name"]).to eq("請求書の発行")
    end

    it "日本語や絵文字も、化けずに保存して返す" do
      patch_skill(skill.id, name: "受発注 😀", note: "𠮷野家")

      expect(json).to include("name" => "受発注 😀", "note" => "𠮷野家")
    end

    it "一覧(GET)にも、更新後の内容が出る" do
      patch_skill(skill.id, name: "更新後")

      get "/api/v1/skills"

      expect(json.map { |s| s["name"] }).to eq([ "更新後" ])
    end

    it "ほかのスキルには影響しない" do
      other = Skill.create!(name: "別のスキル", position: 0)
      before = other.reload.attributes   # 更新の前の、すべての値(更新日時も)

      patch_skill(skill.id, name: "更新後")

      expect(other.reload.attributes).to eq(before)
    end
  end

  describe "編集では変えられない項目(送られても無視する)" do
    it "状態(status)と並び順(position)は変わらない" do
      patch_skill(skill.id, name: "更新後", status: "unlearned", position: 99)

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "更新後", "status" => "learning", "position" => 3)
      expect(skill.reload).to have_attributes(status: "learning", position: 3)
    end

    it "習得日(acquired_on)は変わらない(習得済みのスキルでも、未習得のスキルでも)" do
      mastered = Skill.create!(name: "レジ締め", status: :mastered, acquired_on: Date.new(2026, 9, 1), position: 0)

      patch_skill(mastered.id, name: "レジ締め(改)", acquired_on: "1999-01-01")
      expect(json).to include("name" => "レジ締め(改)", "acquired_on" => "2026-09-01")
      expect(mastered.reload.acquired_on).to eq(Date.new(2026, 9, 1))

      patch_skill(skill.id, acquired_on: "2026-01-01")
      expect(json["acquired_on"]).to be_nil
      expect(skill.reload.acquired_on).to be_nil
    end

    it "習得済みのスキルを編集しても、習得済みのまま(習得日も残る)" do
      mastered = Skill.create!(name: "レジ締め", status: :mastered, acquired_on: Date.new(2026, 9, 1), position: 0)

      patch_skill(mastered.id, priority: "high")

      expect(mastered.reload).to have_attributes(status: "mastered", acquired_on: Date.new(2026, 9, 1), priority: "high")
    end

    it "編集できない項目だけが送られたときは、400 で「編集できる項目がありません」と伝え、何も変えない" do
      patch_skill(skill.id, status: "mastered", acquired_on: "2026-01-01", position: 0)

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"]).to eq([
        "編集できる項目がありません。スキル名(name)、ポイント・考察(note)、優先度(priority)、期限(due_date)のいずれかを送ってください。"
      ])
      expect(skill.reload).to have_attributes(status: "learning", acquired_on: nil, position: 3)
    end

    it "編集できる項目が1つでもあれば、編集できない項目は無視して、編集できる項目だけ更新する" do
      patch_skill(skill.id, priority: "high", status: "mastered", position: 0)

      expect(response).to have_http_status(:ok)
      expect(skill.reload).to have_attributes(priority: "high", status: "learning", position: 3)
    end
  end

  describe "入力が正しくない場合(422、日本語のメッセージ。スキルは変更されない)" do
    it "スキル名が空" do
      patch_skill(skill.id, name: "", priority: "high")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]).to eq("name" => [ "スキル名を入力してください" ])
      expect(skill.reload).to have_attributes(name: "請求書の発行", priority: "medium")
    end

    it "スキル名が空白だけ(全角も)" do
      patch_skill(skill.id, name: "　 ")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["name"]).to eq([ "スキル名を入力してください" ])
    end

    it "スキル名が101文字" do
      patch_skill(skill.id, name: "あ" * 101)

      expect(json["errors"]["name"]).to eq([ "スキル名は100文字以内で入力してください" ])
    end

    it "ポイント・考察が5,001文字" do
      patch_skill(skill.id, note: "あ" * 5001)

      expect(json["errors"]["note"]).to eq([ "ポイント・考察は5000文字以内で入力してください" ])
    end

    it "優先度が、高・中・低以外" do
      patch_skill(skill.id, priority: "urgent")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["priority"]).to eq([ "優先度は high・medium・low のいずれかにしてください" ])
      expect(skill.reload.priority).to eq("medium")
    end

    it "期限が、日付として読めない(黙って空にしない)" do
      patch_skill(skill.id, due_date: "abc")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["due_date"]).to eq([ "期限は不正な値です" ])
      expect(skill.reload.due_date).to eq(Date.new(2026, 10, 15))
    end

    it "複数の項目が正しくないときは、項目ごとにまとめて返す" do
      patch_skill(skill.id, name: "", priority: "urgent", due_date: "abc")

      expect(json["errors"].keys).to match_array(%w[name priority due_date])
    end
  end

  describe "存在しないスキル(404)" do
    it "日本語のメッセージを返す" do
      patch_skill(0, name: "x")

      expect(response).to have_http_status(:not_found)
      expect(json["errors"]["base"]).to eq([ "指定されたスキルが見つかりません。" ])
    end

    it "ほかのスキルは変更されない" do
      patch_skill(skill.id + 1000, name: "x")

      expect(skill.reload.name).to eq("請求書の発行")
    end
  end

  describe "リクエストの形が正しくない場合(400)" do
    it "JSON として読めないときは、共通の文言(リクエストの形が正しくありません)" do
      patch "/api/v1/skills/#{skill.id}", params: "{bad json", headers: { "CONTENT_TYPE" => "application/json" }

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to include("リクエストの形が正しくありません")
    end

    it "中身がまったくないときは、「編集できる項目がありません」と伝える" do
      patch_skill(skill.id, {})

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to start_with("編集できる項目がありません")
    end
  end

  describe "フロントエンド(別のオリジン)から呼ぶ場合" do
    it "許可したオリジンからの、事前確認(preflight)で、PATCH が許可される" do
      options "/api/v1/skills/#{skill.id}", headers: {
        "Origin" => "http://localhost:3000",
        "Access-Control-Request-Method" => "PATCH",
        "Access-Control-Request-Headers" => "content-type"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("PATCH")
    end
  end
end
