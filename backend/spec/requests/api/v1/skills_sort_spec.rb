require "rails_helper"

RSpec.describe "POST /api/v1/skills/sort", type: :request do
  # 返事の中身。let ではなくメソッドにして、リクエストのたびに読み直す
  def json
    response.parsed_body
  end

  # 同じ列(状態)に、[名前, 優先度] の順(並び順 0, 1, 2, ...)でスキルを作る
  def create_column(status, entries)
    entries.each_with_index.map do |(name, priority), index|
      Skill.create!(
        name: name, priority: priority, status: status, position: index,
        acquired_on: status == :mastered ? Date.new(2026, 9, 1) : nil
      )
    end
  end

  # ある列の、いまの「名前と並び順」(並び順の順)
  def column(status)
    Skill.where(status: status).order(:position).pluck(:name, :position)
  end

  def sort_column(status)
    post "/api/v1/skills/sort", params: { status: status }, as: :json
  end

  def snapshot(skills)
    skills.map { |skill| skill.reload.attributes }
  end

  describe "並べ替えできる場合" do
    # 優先度が、ばらばらの列(低 → 中 → 高 → 中 → 低 → 高)
    let!(:skills) do
      create_column(:unlearned, [
        [ "低1", :low ], [ "中1", :medium ], [ "高1", :high ], [ "中2", :medium ], [ "低2", :low ], [ "高2", :high ]
      ])
    end

    it "高 → 中 → 低の順に並べ替えて、保存する(200)" do
      sort_column("unlearned")

      expect(response).to have_http_status(:ok)
      expect(column(:unlearned).map(&:first)).to eq(%w[高1 高2 中1 中2 低1 低2])
    end

    it "同じ優先度どうしは、並べ替える前の順番を保つ" do
      # 前: 低1 中1 高1 中2 低2 高2 → 高は 高1 → 高2、中は 中1 → 中2、低は 低1 → 低2 の順のまま
      sort_column("unlearned")

      names = column(:unlearned).map(&:first)
      expect(names.index("高1")).to be < names.index("高2")
      expect(names.index("中1")).to be < names.index("中2")
      expect(names.index("低1")).to be < names.index("低2")
    end

    it "並べ替えたあとの並び順は、0 からの連番になる" do
      sort_column("unlearned")

      expect(column(:unlearned).map(&:last)).to eq([ 0, 1, 2, 3, 4, 5 ])
    end

    it "並べ替えたあとの、その列のスキルを、順番どおりに返す(一覧(GET)と同じ項目)" do
      sort_column("unlearned")

      expect(json.map { |s| s["name"] }).to eq(%w[高1 高2 中1 中2 低1 低2])
      expect(json.map { |s| s["position"] }).to eq([ 0, 1, 2, 3, 4, 5 ])
      expect(json.first.keys).to match_array(%w[id name note status priority due_date acquired_on position])
    end

    it "一覧(GET)にも、並べ替え後の順番で出る(保存されている)" do
      sort_column("unlearned")

      get "/api/v1/skills"

      expect(json.map { |s| s["name"] }).to eq(%w[高1 高2 中1 中2 低1 低2])
    end

    it "スキルの内容(スキル名・優先度・状態など)は、変わらない。変わるのは並び順だけ" do
      before = snapshot(skills).map { |a| a.except("position", "updated_at") }

      sort_column("unlearned")

      expect(snapshot(skills).map { |a| a.except("position", "updated_at") }).to eq(before)
    end

    it "もう一度並べ替えても、結果は同じ(何度押しても同じ)" do
      sort_column("unlearned")
      once = column(:unlearned)

      sort_column("unlearned")

      expect(column(:unlearned)).to eq(once)
    end

    it "すでに優先度順なら、何も変わらない(更新日時も変わらない)" do
      sort_column("unlearned")
      before = snapshot(skills)

      sort_column("unlearned")

      expect(snapshot(skills)).to eq(before)
    end

    it "並べ替えたあとに追加したスキルは、末尾につく(自動では並べ直さない)" do
      sort_column("unlearned")

      post "/api/v1/skills", params: { name: "新規", status: "unlearned", priority: "high" }, as: :json

      expect(column(:unlearned).last).to eq([ "新規", 6 ])
    end

    it "並べ替えたあとも、移動(move)で、手動で順番を変えられる" do
      sort_column("unlearned")
      first = Skill.find_by!(name: "高1")

      patch "/api/v1/skills/#{first.id}/move", params: { status: "unlearned", position: 5 }, as: :json

      expect(column(:unlearned).map(&:first)).to eq(%w[高2 中1 中2 低1 低2 高1])
    end
  end

  describe "習得中の列" do
    it "習得中の列も、同じように並べ替えられる" do
      create_column(:learning, [ [ "低", :low ], [ "高", :high ], [ "中", :medium ] ])

      sort_column("learning")

      expect(response).to have_http_status(:ok)
      expect(column(:learning)).to eq([ [ "高", 0 ], [ "中", 1 ], [ "低", 2 ] ])
    end
  end

  describe "ほかの列には、影響しない" do
    it "指定していない列(未習得・習得中・習得済み)の並び順は、変わらない" do
      create_column(:unlearned, [ [ "U低", :low ], [ "U高", :high ] ])
      others = create_column(:learning, [ [ "L低", :low ], [ "L高", :high ] ]) +
               create_column(:mastered, [ [ "M低", :low ], [ "M高", :high ] ])
      before = snapshot(others)

      sort_column("unlearned")

      expect(column(:unlearned).map(&:first)).to eq(%w[U高 U低])
      expect(snapshot(others)).to eq(before)
    end
  end

  describe "並び順が歯抜けだったときも" do
    it "0 からの連番に直る(優先度順にもなる)" do
      Skill.create!(name: "低", priority: :low, status: :unlearned, position: 2)
      Skill.create!(name: "高", priority: :high, status: :unlearned, position: 7)

      sort_column("unlearned")

      expect(column(:unlearned)).to eq([ [ "高", 0 ], [ "低", 1 ] ])
    end
  end

  describe "スキルが少ない列" do
    it "空の列は、200 で空の配列を返す" do
      sort_column("learning")

      expect(response).to have_http_status(:ok)
      expect(json).to eq([])
    end

    it "1件だけの列は、そのまま返す" do
      create_column(:unlearned, [ [ "A", :low ] ])

      sort_column("unlearned")

      expect(response).to have_http_status(:ok)
      expect(json.map { |s| s["name"] }).to eq([ "A" ])
    end
  end

  describe "プロトタイプ(prototype/logic.js)のサンプルと、同じ結果になる" do
    it "未習得(低・中・高)は、高・中・低になる。習得中(中・高)は、高・中になる" do
      create_column(:unlearned, [ [ "クレーム対応", :low ], [ "発注書の確認", :medium ], [ "受発注システムの操作", :high ] ])
      create_column(:learning, [ [ "請求書の発行", :medium ], [ "月次レポートの作成", :high ] ])

      sort_column("unlearned")
      sort_column("learning")

      expect(column(:unlearned).map(&:first)).to eq(%w[受発注システムの操作 発注書の確認 クレーム対応])
      expect(column(:learning).map(&:first)).to eq(%w[月次レポートの作成 請求書の発行])
    end
  end

  describe "並べ替えできない・入力が正しくない場合(422、日本語のメッセージ。何も変更されない)" do
    let!(:all_skills) do
      create_column(:unlearned, [ [ "U低", :low ], [ "U高", :high ] ]) +
        create_column(:mastered, [ [ "M低", :low ], [ "M高", :high ] ])
    end

    it "習得済みの列は、並べ替えできない" do
      before = snapshot(all_skills)

      sort_column("mastered")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["base"]).to eq([ "習得済みの列は、優先度順に並べ替えできません。" ])
      expect(snapshot(all_skills)).to eq(before)
    end

    it "状態が、決まった値でない" do
      before = snapshot(all_skills)

      sort_column("bogus")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["status"]).to eq([ "状態は unlearned・learning・mastered のいずれかにしてください" ])
      expect(snapshot(all_skills)).to eq(before)
    end

    it "状態が、空" do
      sort_column("")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["errors"]["status"]).to eq([ "状態を入力してください" ])
    end
  end

  describe "リクエストの形が正しくない場合(400)" do
    it "中身がまったくないときは、「並べ替える状態が指定されていません」と伝える" do
      post "/api/v1/skills/sort", params: {}, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"]).to eq([
        "並べ替える状態が指定されていません。状態(status)に unlearned か learning を送ってください。"
      ])
    end

    it "状態(status)以外の項目だけが送られたときも、同じ" do
      post "/api/v1/skills/sort", params: { name: "x", position: 0 }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to start_with("並べ替える状態が指定されていません")
    end

    it "JSON として読めないときは、共通の文言" do
      post "/api/v1/skills/sort", params: "{bad json", headers: { "CONTENT_TYPE" => "application/json" }

      expect(response).to have_http_status(:bad_request)
      expect(json["errors"]["base"].first).to include("リクエストの形が正しくありません")
    end
  end

  describe "途中で失敗したとき" do
    it "並び順の保存の途中で失敗したら、それまでの並び替えもなかったことになる(まとめて行うため)" do
      skills = create_column(:unlearned, [ [ "低", :low ], [ "中", :medium ], [ "高", :high ] ])
      before = snapshot(skills)
      calls = 0
      allow_any_instance_of(SkillSorter).to receive(:save_position).and_wrap_original do |original, *args|
        calls += 1
        raise "わざと起こした失敗" if calls == 2

        original.call(*args)
      end

      expect { sort_column("unlearned") }.to raise_error("わざと起こした失敗")

      expect(calls).to eq(2) # 1つ目は保存され、2つ目で失敗した
      expect(snapshot(skills)).to eq(before)
    end
  end

  describe "フロントエンド(別のオリジン)から呼ぶ場合" do
    it "許可したオリジンからの、事前確認(preflight)で、POST が許可される" do
      options "/api/v1/skills/sort", headers: {
        "Origin" => "http://localhost:3000",
        "Access-Control-Request-Method" => "POST",
        "Access-Control-Request-Headers" => "content-type"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("POST")
    end
  end
end
