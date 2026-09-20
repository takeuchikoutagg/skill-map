require "rails_helper"

RSpec.describe "POST /api/v1/skills", type: :request do
  # 返事の中身。let ではなくメソッドにして、リクエストのたびに読み直す
  def json
    response.parsed_body
  end

  def post_skill(params)
    post "/api/v1/skills", params: params, as: :json
  end

  describe "追加できる場合" do
    it "スキル名だけで追加でき、201 と作ったスキルを返す(状態は未習得、優先度は中)" do
      expect { post_skill(name: "レジ締め") }.to change(Skill, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "name" => "レジ締め",
        "note" => nil,
        "status" => "unlearned",
        "priority" => "medium",
        "due_date" => nil,
        "acquired_on" => nil,
        "position" => 0
      )
      expect(json["id"]).to eq(Skill.last.id)
    end

    it "一覧(GET)と同じ項目で返す" do
      post_skill(name: "x")

      expect(json.keys).to match_array(%w[id name note status priority due_date acquired_on position])
    end

    it "すべての項目を指定して追加できる" do
      post_skill(name: "請求書の発行", note: "締め日に注意", status: "learning", priority: "high", due_date: "2026-10-31")

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "name" => "請求書の発行",
        "note" => "締め日に注意",
        "status" => "learning",
        "priority" => "high",
        "due_date" => "2026-10-31"
      )
      expect(Skill.find(json["id"])).to have_attributes(status: "learning", priority: "high", due_date: Date.new(2026, 10, 31))
    end

    it "期限は、null や空でもよい" do
      post_skill(name: "a", due_date: nil)
      expect(response).to have_http_status(:created)

      post_skill(name: "b", due_date: "")
      expect(response).to have_http_status(:created)
      expect(json["due_date"]).to be_nil
    end

    it "スキル名の前後の空白は、取り除いて保存する" do
      post_skill(name: "  レジ締め　 ")

      expect(json["name"]).to eq("レジ締め")
    end

    it "日本語や絵文字も、化けずに保存して返す" do
      post_skill(name: "受発注システムの操作 😀", note: "𠮷野家")

      expect(json).to include("name" => "受発注システムの操作 😀", "note" => "𠮷野家")
      expect(Skill.find(json["id"]).note).to eq("𠮷野家")
    end
  end

  describe "並び順(列の末尾に置く)" do
    it "同じ状態の、最後に追加される" do
      Skill.create!(name: "既存A", status: :unlearned, position: 0)
      Skill.create!(name: "既存B", status: :unlearned, position: 1)

      post_skill(name: "新規", status: "unlearned")

      expect(json["position"]).to eq(2)
    end

    it "並び順が飛んでいても、いちばん大きい値の次になる" do
      Skill.create!(name: "既存", status: :learning, position: 5)

      post_skill(name: "新規", status: "learning")

      expect(json["position"]).to eq(6)
    end

    it "ほかの状態の列には影響されない(空の列なら 0)" do
      Skill.create!(name: "未習得A", status: :unlearned, position: 0)
      Skill.create!(name: "未習得B", status: :unlearned, position: 1)

      post_skill(name: "習得中A", status: "learning")

      expect(json["position"]).to eq(0)
    end

    it "一覧(GET)では、追加したスキルが列の最後に出る" do
      Skill.create!(name: "既存", status: :unlearned, position: 0)
      post_skill(name: "新規")

      get "/api/v1/skills"

      expect(json.map { |s| s["name"] }).to eq(%w[既存 新規])
    end
  end

  describe "習得済みには追加できない" do
    it "422 を返し、スキルは作られない" do
      expect { post_skill(name: "レジ締め", status: "mastered") }.not_to change(Skill, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["base"].first).to include("習得済みの列には、スキルを直接追加できません")
    end
  end

  describe "サーバーが決める項目は、送られても無視する" do
    it "習得日(acquired_on)と並び順(position)は、指定しても使われない" do
      Skill.create!(name: "既存", status: :unlearned, position: 0)

      post_skill(name: "新規", acquired_on: "2026-01-01", position: 99)

      expect(response).to have_http_status(:created)
      expect(json).to include("acquired_on" => nil, "position" => 1)
    end
  end

  describe "入力が正しくない場合(422、日本語のメッセージ)" do
    it "スキル名が空" do
      expect { post_skill(name: "") }.not_to change(Skill, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]).to eq("name" => ["スキル名を入力してください"])
    end

    it "スキル名が空白だけ" do
      post_skill(name: "   ")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["name"]).to eq(["スキル名を入力してください"])
    end

    it "スキル名が101文字" do
      post_skill(name: "あ" * 101)

      expect(json["errors"]["name"]).to eq(["スキル名は100文字以内で入力してください"])
    end

    it "スキル名が100文字ちょうどなら、追加できる" do
      post_skill(name: "あ" * 100)

      expect(response).to have_http_status(:created)
    end

    it "ポイント・考察が5,001文字" do
      post_skill(name: "a", note: "あ" * 5001)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["note"]).to eq(["ポイント・考察は5000文字以内で入力してください"])
    end

    it "優先度が、高・中・低以外" do
      post_skill(name: "a", priority: "urgent")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["priority"]).to eq(["優先度は high・medium・low のいずれかにしてください"])
    end

    it "状態が、未習得・習得中・習得済み以外" do
      expect { post_skill(name: "a", status: "bogus") }.not_to change(Skill, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["status"]).to eq(["状態は unlearned・learning・mastered のいずれかにしてください"])
    end

    it "期限が、日付として読めない(黙って空にしない)" do
      expect { post_skill(name: "a", due_date: "abc") }.not_to change(Skill, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["due_date"]).to eq(["期限は不正な値です"])
    end

    it "期限が、存在しない日付" do
      post_skill(name: "a", due_date: "2026-02-30")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]).to have_key("due_date")
    end

    it "複数の項目が正しくないときは、項目ごとにまとめて返す" do
      post_skill(name: "", priority: "urgent", due_date: "abc")

      expect(json["errors"].keys).to match_array(%w[name priority due_date])
    end
  end

  describe "リクエストの形が正しくない場合(400)" do
    it "JSON として読めない" do
      post "/api/v1/skills", params: "{bad json", headers: { "CONTENT_TYPE" => "application/json" }

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"]).to be_present
    end

    it "スキルの内容が、まったくない" do
      post_skill({})

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"]).to be_present
    end
  end

  describe "フロントエンド(別のオリジン)から呼ぶ場合" do
    it "許可したオリジンからの、事前確認(preflight)で、POST が許可される" do
      options "/api/v1/skills", headers: {
        "Origin" => "http://localhost:3000",
        "Access-Control-Request-Method" => "POST",
        "Access-Control-Request-Headers" => "content-type"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("POST")
    end
  end
end
