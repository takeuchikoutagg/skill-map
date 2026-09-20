require "rails_helper"

RSpec.describe SkillMover do
  def create_skill(name, status, position)
    Skill.create!(
      name: name, status: status, position: position,
      acquired_on: status == :mastered ? Date.new(2026, 9, 1) : nil
    )
  end

  describe "#call" do
    it "移動できたら true を返し、渡したスキルの状態・位置・習得日が更新されている" do
      skill = create_skill("A", :unlearned, 0)

      result = SkillMover.new(skill, status: "mastered", position: 0, today: Date.new(2030, 1, 1)).call

      expect(result).to be(true)
      expect(skill).to have_attributes(status: "mastered", position: 0, acquired_on: Date.new(2030, 1, 1))
    end

    it "習得日には、渡した today が使われる(指定しなければ、日本の今日)" do
      travel_to(Time.utc(2026, 9, 19, 15, 0, 0)) do
        skill = create_skill("A", :learning, 0)

        SkillMover.new(skill, status: "mastered", position: 0).call

        expect(skill.acquired_on).to eq(Date.new(2026, 9, 20))
      end
    end

    it "入力が正しくないときは false を返し、理由を skill.errors に入れて、何も変えない" do
      skill = create_skill("A", :unlearned, 0)
      before = skill.reload.attributes

      result = SkillMover.new(skill, status: "bogus", position: -1).call

      expect(result).to be(false)
      expect(skill.errors.full_messages).to contain_exactly(
        "状態は unlearned・learning・mastered のいずれかにしてください",
        "並び順は0以上の整数で指定してください"
      )
      expect(skill.reload.attributes).to eq(before)
    end
  end

  describe "たくさん移動しても、規則が崩れない" do
    it "ランダムに 300 回移動しても、すべての規則が守られる" do
      skills = []
      %i[unlearned learning mastered].each do |status|
        4.times { |i| skills << create_skill("#{status}#{i}", status, i) }
      end
      count = skills.size
      statuses = Skill.statuses.keys
      random = Random.new(2026)

      300.times do |step|
        skill = Skill.find(skills.sample(random: random).id)
        mover = SkillMover.new(skill, status: statuses.sample(random: random), position: random.rand(0..6),
                               today: Date.new(2026, 9, 1) + step)

        expect(mover.call).to be(true)

        # 規則 1: スキルの数は変わらない
        expect(Skill.count).to eq(count)
        Skill.statuses.each_key do |status|
          # 規則 2: 同じ状態の中では、並び順が 0 から連番になる
          positions = Skill.where(status: status).order(:position).pluck(:position)
          expect(positions).to eq((0...positions.size).to_a), "#{step} 回目: #{status} の並び順が #{positions.inspect}"
        end
        # 規則 3: 習得済みのスキルだけが、習得日を持つ(モデルの検証と同じ)
        Skill.find_each do |s|
          expect(s.acquired_on.present?).to eq(s.mastered?), "#{step} 回目: #{s.name} の習得日が #{s.acquired_on.inspect}"
          expect(s).to be_valid
        end
      end
    end
  end
end
