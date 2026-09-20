require "rails_helper"

RSpec.describe "DELETE /api/v1/skills/:id", type: :request do
  # 返事の中身。let ではなくメソッドにして、リクエストのたびに読み直す
  def json
    response.parsed_body
  end

  # 同じ列(状態)のスキルを、並び順 0, 1, 2 で作る
  def create_column(status, names)
    names.each_with_index.map { |name, index| Skill.create!(name: name, status: status, position: index) }
  end

  # ある列の、いまの「名前と並び順」(並び順の順)
  def column(status)
    Skill.where(status: status).order(:position).pluck(:name, :position)
  end

  describe "削除できる場合" do
    let!(:skill) { Skill.create!(name: "請求書の発行", position: 0) }

    it "204 を返し(中身なし)、スキルが削除される" do
      expect { delete "/api/v1/skills/#{skill.id}" }.to change(Skill, :count).by(-1)

      expect(response).to have_http_status(:no_content)
      expect(response.body).to be_empty
      expect(Skill.exists?(skill.id)).to be(false)
    end

    it "一覧(GET)に、削除したスキルは出ない" do
      delete "/api/v1/skills/#{skill.id}"

      get "/api/v1/skills"

      expect(json).to eq([])
    end

    it "習得済みのスキルも、削除できる" do
      mastered = Skill.create!(name: "レジ締め", status: :mastered, acquired_on: Date.new(2026, 9, 1), position: 0)

      delete "/api/v1/skills/#{mastered.id}"

      expect(response).to have_http_status(:no_content)
      expect(Skill.exists?(mastered.id)).to be(false)
    end
  end

  describe "同じ列の並び順を詰める" do
    let!(:skills) { create_column(:unlearned, %w[A B C D]) } # 並び順 0, 1, 2, 3

    it "真ん中を削除すると、後ろのスキルが1つずつ前に詰まる" do
      delete "/api/v1/skills/#{skills[1].id}"

      expect(column(:unlearned)).to eq([["A", 0], ["C", 1], ["D", 2]])
    end

    it "先頭を削除すると、すべてが1つずつ前に詰まる" do
      delete "/api/v1/skills/#{skills[0].id}"

      expect(column(:unlearned)).to eq([["B", 0], ["C", 1], ["D", 2]])
    end

    it "末尾を削除しても、ほかの並び順は変わらない" do
      delete "/api/v1/skills/#{skills[3].id}"

      expect(column(:unlearned)).to eq([["A", 0], ["B", 1], ["C", 2]])
    end

    it "続けて削除しても、いつも 0 からの連番になる" do
      delete "/api/v1/skills/#{skills[1].id}"
      delete "/api/v1/skills/#{skills[2].id}"

      expect(column(:unlearned)).to eq([["A", 0], ["D", 1]])
    end

    it "最後の1つを削除すると、その列は空になる" do
      skills.each { |skill| delete "/api/v1/skills/#{skill.id}" }

      expect(column(:unlearned)).to eq([])
    end

    it "並び順が歯抜けだったり、飛んでいたりしても、0 からの連番に直る(順番は変えない)" do
      Skill.where(status: :unlearned).delete_all
      first  = Skill.create!(name: "A", status: :unlearned, position: 0)
      Skill.create!(name: "B", status: :unlearned, position: 2)
      Skill.create!(name: "C", status: :unlearned, position: 7)

      delete "/api/v1/skills/#{first.id}"

      expect(column(:unlearned)).to eq([["B", 0], ["C", 1]])
    end

    it "ほかの列(状態)のスキルには、影響しない" do
      learning = create_column(:learning, %w[L1 L2])
      mastered = Skill.create!(name: "M1", status: :mastered, acquired_on: Date.new(2026, 9, 1), position: 0)
      before = (learning + [mastered]).map { |s| s.reload.attributes }

      delete "/api/v1/skills/#{skills[1].id}"

      expect((learning + [mastered]).map { |s| s.reload.attributes }).to eq(before)
    end

    it "習得済みの列でも、並び順を詰め、残ったスキルの習得日は変えない" do
      mastered = [
        Skill.create!(name: "M1", status: :mastered, acquired_on: Date.new(2026, 9, 1), position: 0),
        Skill.create!(name: "M2", status: :mastered, acquired_on: Date.new(2026, 9, 2), position: 1),
        Skill.create!(name: "M3", status: :mastered, acquired_on: Date.new(2026, 9, 3), position: 2)
      ]

      delete "/api/v1/skills/#{mastered[0].id}"

      expect(column(:mastered)).to eq([["M2", 0], ["M3", 1]])
      expect(Skill.where(status: :mastered).order(:position).pluck(:acquired_on)).to eq([Date.new(2026, 9, 2), Date.new(2026, 9, 3)])
    end

    it "追加すると、詰めたあとの末尾につく" do
      delete "/api/v1/skills/#{skills[1].id}"

      post "/api/v1/skills", params: { name: "E" }, as: :json

      expect(column(:unlearned)).to eq([["A", 0], ["C", 1], ["D", 2], ["E", 3]])
    end
  end

  describe "途中で失敗したとき" do
    it "並び順の振り直しに失敗したら、削除もなかったことになる(まとめて行うため)" do
      skill = Skill.create!(name: "残るはず", position: 0)
      allow(Skill).to receive(:renumber_positions).and_raise("わざと起こした失敗")

      expect { delete "/api/v1/skills/#{skill.id}" }.to raise_error("わざと起こした失敗")

      expect(Skill.exists?(skill.id)).to be(true)
    end
  end

  describe "存在しないスキル(404)" do
    it "日本語のメッセージを返し、ほかのスキルは変更されない" do
      skill = Skill.create!(name: "残る", position: 0)

      expect { delete "/api/v1/skills/#{skill.id + 1000}" }.not_to change(Skill, :count)

      expect(response).to have_http_status(:not_found)
      expect(json["errors"]["base"]).to eq(["指定されたスキルが見つかりません。"])
    end

    it "同じスキルをもう一度削除すると、404" do
      skill = Skill.create!(name: "x", position: 0)
      delete "/api/v1/skills/#{skill.id}"
      expect(response).to have_http_status(:no_content)

      delete "/api/v1/skills/#{skill.id}"

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "フロントエンド(別のオリジン)から呼ぶ場合" do
    it "許可したオリジンからの、事前確認(preflight)で、DELETE が許可される" do
      options "/api/v1/skills/1", headers: {
        "Origin" => "http://localhost:3000",
        "Access-Control-Request-Method" => "DELETE"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("DELETE")
    end
  end
end
