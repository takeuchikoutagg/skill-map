require "rails_helper"

RSpec.describe Skill, type: :model do
  # 最低限の入力(スキル名と並び順)があれば、保存できる
  def build_skill(overrides = {})
    Skill.new({ name: "レジ締め", position: 0 }.merge(overrides))
  end

  describe "初期値" do
    it "状態は未習得、優先度は中" do
      skill = build_skill

      expect(skill.status).to eq("unlearned")
      expect(skill.priority).to eq("medium")
      expect(skill).to be_valid
    end
  end

  describe "スキル名" do
    it "空だと保存できない" do
      expect(build_skill(name: "")).not_to be_valid
      expect(build_skill(name: nil)).not_to be_valid
      expect(build_skill(name: "   ")).not_to be_valid
    end

    it "100文字までは保存できて、101文字は保存できない" do
      expect(build_skill(name: "あ" * 100)).to be_valid
      expect(build_skill(name: "あ" * 101)).not_to be_valid
    end
  end

  describe "ポイント・考察" do
    it "空でもよい" do
      expect(build_skill(note: nil)).to be_valid
    end

    it "5,000文字までは保存できて、5,001文字は保存できない" do
      expect(build_skill(note: "あ" * 5000)).to be_valid
      expect(build_skill(note: "あ" * 5001)).not_to be_valid
    end
  end

  describe "状態(status)" do
    it "未習得・習得中・習得済みの3つを使える" do
      expect(Skill.statuses.keys).to eq(%w[unlearned learning mastered])
    end

    it "それ以外の値は保存できない" do
      skill = build_skill(status: "bogus")

      expect(skill).not_to be_valid
      expect(skill.errors[:status]).to be_present
    end

    it "名前で調べられる(mastered? など)" do
      expect(build_skill(status: :mastered)).to be_mastered
      expect(build_skill(status: :learning)).not_to be_mastered
    end
  end

  describe "優先度(priority)" do
    it "高・中・低の3つを使える" do
      expect(Skill.priorities.keys).to eq(%w[high medium low])
    end

    it "それ以外の値は保存できない" do
      expect(build_skill(priority: "urgent")).not_to be_valid
    end
  end

  describe "並び順(position)" do
    it "必須" do
      expect(build_skill(position: nil)).not_to be_valid
    end

    it "0以上の整数" do
      expect(build_skill(position: 0)).to be_valid
      expect(build_skill(position: -1)).not_to be_valid
    end
  end

  # ここから先は、実際に MySQL へ保存して、取り出せるかの確認
  describe "MySQL への保存と取り出し" do
    it "すべての項目を保存して、そのまま取り出せる" do
      saved = Skill.create!(
        name: "請求書の発行",
        note: "締め日に注意する",
        status: :mastered,
        priority: :high,
        due_date: Date.new(2026, 10, 31),
        acquired_on: Date.new(2026, 9, 1),
        position: 3
      )

      found = Skill.find(saved.id)

      expect(found).to have_attributes(
        name: "請求書の発行",
        note: "締め日に注意する",
        status: "mastered",
        priority: "high",
        due_date: Date.new(2026, 10, 31),
        acquired_on: Date.new(2026, 9, 1),
        position: 3
      )
      expect(found.created_at).to be_present
    end

    it "日本語や絵文字(4バイト文字)も、化けずに保存して取り出せる(utf8mb4)" do
      text = "受発注システムの操作 😀 𠮷野家"
      saved = Skill.create!(name: text, note: text, position: 0)

      expect(Skill.find(saved.id).name).to eq(text)
      expect(Skill.find(saved.id).note).to eq(text)
    end

    it "状態と優先度は、DB には数字で保存される" do
      saved = Skill.create!(name: "x", status: :mastered, priority: :low, position: 0)

      # Rails を通さず、SQL で直接、DB の値を読む(Rails 経由だと名前に変換されてしまうため)
      raw = Skill.with_connection do |connection|
        connection.select_rows("SELECT status, priority FROM skills WHERE id = #{saved.id.to_i}").first
      end

      expect(raw).to eq([2, 2])
    end

    it "状態ごと・並び順で取り出せる" do
      Skill.create!(name: "習得済みA", status: :mastered, position: 0)
      Skill.create!(name: "未習得B", status: :unlearned, position: 1)
      Skill.create!(name: "未習得A", status: :unlearned, position: 0)
      Skill.create!(name: "習得中A", status: :learning, position: 0)

      names = Skill.order(:status, :position).pluck(:name)

      expect(names).to eq(%w[未習得A 未習得B 習得中A 習得済みA])
    end

    it "状態を指定して、その列のスキルだけ取り出せる" do
      Skill.create!(name: "未習得A", status: :unlearned, position: 0)
      Skill.create!(name: "習得中A", status: :learning, position: 0)

      expect(Skill.unlearned.pluck(:name)).to eq(["未習得A"])
      expect(Skill.mastered).to be_empty
    end
  end
end
