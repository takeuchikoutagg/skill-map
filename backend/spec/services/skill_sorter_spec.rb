require "rails_helper"

RSpec.describe SkillSorter do
  describe "#call" do
    it "並べ替えできたら true を返し、skills に並べ替えたあとのスキルが入る" do
      Skill.create!(name: "低", priority: :low, status: :unlearned, position: 0)
      Skill.create!(name: "高", priority: :high, status: :unlearned, position: 1)
      sorter = SkillSorter.new("unlearned")

      expect(sorter.call).to be(true)
      expect(sorter.skills.map(&:name)).to eq(%w[高 低])
      expect(sorter.skills.map(&:position)).to eq([ 0, 1 ])
      expect(sorter.errors).to be_empty
    end

    it "習得済みは false を返し、理由を errors に入れる" do
      sorter = SkillSorter.new("mastered")

      expect(sorter.call).to be(false)
      expect(sorter.errors.full_messages).to eq([ "習得済みの列は、優先度順に並べ替えできません。" ])
      expect(sorter.skills).to eq([])
    end

    it "状態が正しくないときは false を返す" do
      expect(SkillSorter.new("bogus").call).to be(false)
      expect(SkillSorter.new(nil).call).to be(false)
      expect(SkillSorter.new("").call).to be(false)
    end
  end

  describe "たくさんの組み合わせでも、正しく並べ替えられる" do
    it "ランダムな優先度の列を 200 通り並べ替えて、毎回、正しい順番と連番になる" do
      random = Random.new(2026)
      priorities = Skill.priorities.keys

      200.times do |round|
        Skill.delete_all
        size = random.rand(0..8)
        size.times do |i|
          Skill.create!(name: "S#{i}", priority: priorities.sample(random: random), status: :learning,
                        position: random.rand(0..20))
        end
        # 期待する結果: 「いまの順番(並び順、同じなら id)」を土台に、優先度で安定的に並べる
        before = Skill.where(status: :learning).order(:position, :id).to_a
        expected = before.each_with_index.sort_by { |s, i| [ Skill.priorities[s.priority], i ] }.map { |s, _| s.id }

        sorter = SkillSorter.new("learning")
        expect(sorter.call).to be(true)

        actual = Skill.where(status: :learning).order(:position).pluck(:id, :position)
        expect(actual.map(&:first)).to eq(expected), "#{round} 回目: 並び順が違う"
        expect(actual.map(&:last)).to eq((0...size).to_a), "#{round} 回目: 連番になっていない"
      end
    end
  end
end
