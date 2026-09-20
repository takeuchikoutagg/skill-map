require "rails_helper"

RSpec.describe "PATCH /api/v1/skills/:id/move", type: :request do
  # 返事の中身。let ではなくメソッドにして、リクエストのたびに読み直す
  def json
    response.parsed_body
  end

  # 同じ列(状態)のスキルを、並び順 0, 1, 2, ... で作る
  def create_column(status, names)
    names.each_with_index.map do |name, index|
      acquired_on = status == :mastered ? Date.new(2026, 9, 1) : nil
      Skill.create!(name: name, status: status, position: index, acquired_on: acquired_on)
    end
  end

  # ある列の、いまの「名前と並び順」(並び順の順)
  def column(status)
    Skill.where(status: status).order(:position).pluck(:name, :position)
  end

  def move_skill(skill, status:, position:)
    patch "/api/v1/skills/#{skill.id}/move", params: { status: status, position: position }, as: :json
  end

  # すべてのスキルの、いまの状態(移動しなかったものを比べるため)
  def snapshot(skills)
    skills.map { |skill| skill.reload.attributes }
  end

  describe "同じ列の中での並び替え" do
    let!(:a) { create_column(:unlearned, %w[A B C D]) } # 並び順 0, 1, 2, 3

    it "先頭を、3番目に動かす(移動後の位置で指定する)" do
      move_skill(a[0], status: "unlearned", position: 2)

      expect(response).to have_http_status(:ok)
      expect(column(:unlearned)).to eq([["B", 0], ["C", 1], ["A", 2], ["D", 3]])
    end

    it "末尾を、先頭に動かす" do
      move_skill(a[3], status: "unlearned", position: 0)

      expect(column(:unlearned)).to eq([["D", 0], ["A", 1], ["B", 2], ["C", 3]])
    end

    it "先頭を、末尾に動かす" do
      move_skill(a[0], status: "unlearned", position: 3)

      expect(column(:unlearned)).to eq([["B", 0], ["C", 1], ["D", 2], ["A", 3]])
    end

    it "いまと同じ位置を指定しても、何も変わらない(200)" do
      move_skill(a[1], status: "unlearned", position: 1)

      expect(response).to have_http_status(:ok)
      expect(column(:unlearned)).to eq([["A", 0], ["B", 1], ["C", 2], ["D", 3]])
    end

    it "列の長さより大きい位置は、末尾になる" do
      move_skill(a[0], status: "unlearned", position: 99)

      expect(column(:unlearned)).to eq([["B", 0], ["C", 1], ["D", 2], ["A", 3]])
      expect(json["position"]).to eq(3)
    end

    it "位置は、数字の文字列でもよい" do
      move_skill(a[0], status: "unlearned", position: "2")

      expect(response).to have_http_status(:ok)
      expect(column(:unlearned)).to eq([["B", 0], ["C", 1], ["A", 2], ["D", 3]])
    end

    it "移動したスキルを、一覧(GET)と同じ項目で、移動後の状態で返す" do
      move_skill(a[0], status: "unlearned", position: 2)

      expect(json).to include("id" => a[0].id, "name" => "A", "status" => "unlearned", "position" => 2)
      expect(json.keys).to match_array(%w[id name note status priority due_date acquired_on position])
    end

    it "一覧(GET)にも、並び替え後の順番で出る" do
      move_skill(a[0], status: "unlearned", position: 2)

      get "/api/v1/skills"

      expect(json.map { |s| s["name"] }).to eq(%w[B C A D])
    end

    it "ほかの列には、影響しない" do
      others = create_column(:learning, %w[L1 L2]) + create_column(:mastered, %w[M1])
      before = snapshot(others)

      move_skill(a[0], status: "unlearned", position: 2)

      expect(snapshot(others)).to eq(before)
    end
  end

  describe "列間の移動" do
    let!(:unlearned) { create_column(:unlearned, %w[A B C]) }
    let!(:learning)  { create_column(:learning, %w[L1 L2]) }

    it "移動先の先頭に入れる。移動先は後ろにずれ、移動元は詰まる" do
      move_skill(unlearned[1], status: "learning", position: 0)

      expect(response).to have_http_status(:ok)
      expect(column(:learning)).to eq([["B", 0], ["L1", 1], ["L2", 2]])
      expect(column(:unlearned)).to eq([["A", 0], ["C", 1]])
    end

    it "移動先の真ん中に入れる" do
      move_skill(unlearned[0], status: "learning", position: 1)

      expect(column(:learning)).to eq([["L1", 0], ["A", 1], ["L2", 2]])
      expect(column(:unlearned)).to eq([["B", 0], ["C", 1]])
    end

    it "移動先の末尾に入れる" do
      move_skill(unlearned[2], status: "learning", position: 2)

      expect(column(:learning)).to eq([["L1", 0], ["L2", 1], ["C", 2]])
      expect(column(:unlearned)).to eq([["A", 0], ["B", 1]])
    end

    it "移動元の先頭を移すと、残りが前に詰まる" do
      move_skill(unlearned[0], status: "learning", position: 99)

      expect(column(:unlearned)).to eq([["B", 0], ["C", 1]])
    end

    it "移動先が空の列でも移動できる。移動元が空になってもよい" do
      Skill.where(status: :learning).delete_all
      Skill.where(status: :unlearned).where.not(name: "A").delete_all

      move_skill(Skill.find_by!(name: "A"), status: "learning", position: 0)

      expect(column(:learning)).to eq([["A", 0]])
      expect(column(:unlearned)).to eq([])
    end

    it "習得中から未習得へ、戻すこともできる(どの列からどの列へも移動できる)" do
      move_skill(learning[0], status: "unlearned", position: 1)

      expect(column(:unlearned)).to eq([["A", 0], ["L1", 1], ["B", 2], ["C", 3]])
      expect(column(:learning)).to eq([["L2", 0]])
    end

    it "スキル名・ポイント・優先度・期限は、変わらない" do
      skill = Skill.create!(name: "全項目", note: "メモ", priority: :high, due_date: Date.new(2026, 10, 31), position: 3)

      move_skill(skill, status: "learning", position: 0)

      expect(skill.reload).to have_attributes(name: "全項目", note: "メモ", priority: "high", due_date: Date.new(2026, 10, 31))
    end

    it "ほかの列(習得済み)には、影響しない" do
      mastered = create_column(:mastered, %w[M1 M2])
      before = snapshot(mastered)

      move_skill(unlearned[0], status: "learning", position: 0)

      expect(snapshot(mastered)).to eq(before)
    end

    it "追加すると、移動したあとの末尾につく" do
      move_skill(unlearned[0], status: "learning", position: 0)

      post "/api/v1/skills", params: { name: "新規", status: "learning" }, as: :json

      expect(column(:learning)).to eq([["A", 0], ["L1", 1], ["L2", 2], ["新規", 3]])
    end
  end

  # 2026-09-19 15:00(UTC)は、日本では 2026-09-20 の 0:00。サーバーの日付は、日本の日付になる
  describe "習得日の自動記録" do
    around { |example| travel_to(Time.utc(2026, 9, 19, 15, 0, 0)) { example.run } }

    let!(:unlearned) { create_column(:unlearned, %w[A B]) }
    let!(:learning)  { create_column(:learning, %w[L1]) }
    let!(:mastered)  { create_column(:mastered, %w[M1 M2]) } # 習得日は、どちらも 2026-09-01

    it "未習得 → 習得済み: 今日(日本の日付)が記録される" do
      move_skill(unlearned[0], status: "mastered", position: 0)

      expect(json).to include("status" => "mastered", "acquired_on" => "2026-09-20")
      expect(unlearned[0].reload.acquired_on).to eq(Date.new(2026, 9, 20))
    end

    it "習得中 → 習得済み: 今日が記録される" do
      move_skill(learning[0], status: "mastered", position: 99)

      expect(json).to include("acquired_on" => "2026-09-20", "position" => 2)
    end

    it "習得済み → 未習得: 習得日が消える(確認なし)" do
      move_skill(mastered[0], status: "unlearned", position: 0)

      expect(json).to include("status" => "unlearned", "acquired_on" => nil)
      expect(mastered[0].reload.acquired_on).to be_nil
    end

    it "習得済み → 習得中: 習得日が消える" do
      move_skill(mastered[1], status: "learning", position: 0)

      expect(json["acquired_on"]).to be_nil
    end

    it "未習得 → 習得中、習得中 → 未習得: 習得日は空のまま" do
      move_skill(unlearned[0], status: "learning", position: 0)
      expect(json["acquired_on"]).to be_nil

      move_skill(learning[0], status: "unlearned", position: 0)
      expect(json["acquired_on"]).to be_nil
    end

    it "習得済みの中での並び替え: 習得日は変わらない(今日の日付にならない)" do
      move_skill(mastered[0], status: "mastered", position: 1)

      expect(response).to have_http_status(:ok)
      expect(column(:mastered)).to eq([["M2", 0], ["M1", 1]])
      expect(json["acquired_on"]).to eq("2026-09-01")
      expect(mastered[0].reload.acquired_on).to eq(Date.new(2026, 9, 1))
    end

    it "習得済みに戻したあと、もう一度習得済みへ移すと、新しい日付で記録し直す" do
      move_skill(mastered[0], status: "learning", position: 0)
      expect(json["acquired_on"]).to be_nil

      travel_to(Time.utc(2026, 10, 1, 3, 0, 0)) # 日付を進める(日本では 2026-10-01)
      move_skill(mastered[0], status: "mastered", position: 0)

      expect(json["acquired_on"]).to eq("2026-10-01")
    end

    it "習得済みに移すとき、習得日を送っても無視して、サーバーの日付を記録する" do
      patch "/api/v1/skills/#{unlearned[0].id}/move",
            params: { status: "mastered", position: 0, acquired_on: "1999-01-01" }, as: :json

      expect(json["acquired_on"]).to eq("2026-09-20")
    end

    it "習得済みから移すとき、習得日を送っても無視して、消す" do
      patch "/api/v1/skills/#{mastered[0].id}/move",
            params: { status: "learning", position: 0, acquired_on: "2026-01-01" }, as: :json

      expect(json["acquired_on"]).to be_nil
    end

    it "移動しなかったスキルの習得日は、変わらない" do
      before = snapshot(mastered)

      move_skill(unlearned[0], status: "learning", position: 0)

      expect(snapshot(mastered)).to eq(before)
    end

    it "何度移動しても、「習得済みのスキルだけが習得日を持つ」ルールが守られる" do
      move_skill(unlearned[0], status: "mastered", position: 0)
      move_skill(mastered[0], status: "unlearned", position: 0)
      move_skill(learning[0], status: "mastered", position: 1)
      move_skill(unlearned[1], status: "learning", position: 0)

      Skill.find_each do |skill|
        expect(skill.acquired_on.present?).to eq(skill.mastered?), "#{skill.name}: #{skill.status} / #{skill.acquired_on.inspect}"
      end
    end
  end

  describe "移動では変えられない項目(送られても無視する)" do
    it "スキル名などを送っても変わらない" do
      skill = Skill.create!(name: "元の名前", note: "元のメモ", priority: :low, position: 0)

      patch "/api/v1/skills/#{skill.id}/move",
            params: { status: "learning", position: 0, name: "書き換え", note: "x", priority: "high" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(skill.reload).to have_attributes(name: "元の名前", note: "元のメモ", priority: "low", status: "learning")
    end
  end

  describe "入力が正しくない場合(422、日本語のメッセージ。何も変更されない)" do
    let!(:skills) { create_column(:unlearned, %w[A B C]) + create_column(:learning, %w[L1]) }

    def expect_nothing_changed(before)
      expect(snapshot(skills)).to eq(before)
    end

    it "移動先の状態が、決まった値でない" do
      before = snapshot(skills)

      move_skill(skills[0], status: "bogus", position: 0)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["status"]).to eq(["状態は unlearned・learning・mastered のいずれかにしてください"])
      expect_nothing_changed(before)
    end

    it "移動先の状態が、ない" do
      before = snapshot(skills)

      patch "/api/v1/skills/#{skills[0].id}/move", params: { position: 0 }, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["status"]).to eq(["状態を入力してください"])
      expect_nothing_changed(before)
    end

    it "位置が、ない" do
      before = snapshot(skills)

      patch "/api/v1/skills/#{skills[0].id}/move", params: { status: "learning" }, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["position"]).to eq(["並び順は0以上の整数で指定してください"])
      expect_nothing_changed(before)
    end

    it "位置が、0以上の整数でない(負の数、小数、文字、空)" do
      before = snapshot(skills)

      [-1, "-1", 1.5, "1.5", "abc", "", nil, true].each do |bad|
        move_skill(skills[0], status: "learning", position: bad)

        expect(response).to have_http_status(:unprocessable_content), "位置 #{bad.inspect} が受け付けられた"
        expect(json["errors"]["position"]).to eq(["並び順は0以上の整数で指定してください"])
      end
      expect_nothing_changed(before)
    end

    it "状態も位置も正しくないときは、項目ごとにまとめて返す" do
      move_skill(skills[0], status: "bogus", position: -1)

      expect(json["errors"].keys).to match_array(%w[status position])
    end
  end

  describe "存在しないスキル(404)" do
    it "日本語のメッセージを返し、ほかのスキルは変更されない" do
      skills = create_column(:unlearned, %w[A B])
      before = snapshot(skills)

      patch "/api/v1/skills/0/move", params: { status: "learning", position: 0 }, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json["errors"]["base"]).to eq(["指定されたスキルが見つかりません。"])
      expect(snapshot(skills)).to eq(before)
    end
  end

  describe "リクエストの形が正しくない場合(400)" do
    let!(:skill) { Skill.create!(name: "A", position: 0) }

    it "中身がまったくないときは、「移動先が指定されていません」と伝える" do
      patch "/api/v1/skills/#{skill.id}/move", params: {}, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"]).to eq(["移動先が指定されていません。移動先の状態(status)と位置(position)を送ってください。"])
    end

    it "移動先の項目(状態・位置)が1つもないときも、同じ" do
      patch "/api/v1/skills/#{skill.id}/move", params: { name: "x", acquired_on: "2026-01-01" }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to start_with("移動先が指定されていません")
    end

    it "JSON として読めないときは、共通の文言" do
      patch "/api/v1/skills/#{skill.id}/move", params: "{bad json", headers: { "CONTENT_TYPE" => "application/json" }

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to include("リクエストの形が正しくありません")
    end
  end

  describe "途中で失敗したとき" do
    it "並び順の振り直しに失敗したら、移動も、習得日の変更も、すべてなかったことになる(まとめて行うため)" do
      skills = create_column(:mastered, %w[M1 M2]) + create_column(:unlearned, %w[A B C])
      before = snapshot(skills)
      allow(Skill).to receive(:renumber_positions).and_raise("わざと起こした失敗")

      expect { move_skill(skills[0], status: "unlearned", position: 1) }.to raise_error("わざと起こした失敗")

      expect(snapshot(skills)).to eq(before)
    end
  end

  describe "フロントエンド(別のオリジン)から呼ぶ場合" do
    it "許可したオリジンからの、事前確認(preflight)で、PATCH が許可される" do
      options "/api/v1/skills/1/move", headers: {
        "Origin" => "http://localhost:3000",
        "Access-Control-Request-Method" => "PATCH",
        "Access-Control-Request-Headers" => "content-type"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("PATCH")
    end
  end
end
