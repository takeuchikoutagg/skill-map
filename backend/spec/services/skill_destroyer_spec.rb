require "rails_helper"

RSpec.describe SkillDestroyer do
  def create_skill(name, status, position)
    Skill.create!(name: name, status: status, position: position, acquired_on: status == :mastered ? Date.new(2026, 9, 1) : nil)
  end

  describe "#call" do
    it "削除できたら true を返し、スキルがなくなる" do
      skill = create_skill("A", :unlearned, 0)

      expect(SkillDestroyer.new(skill.id).call).to be(true)
      expect(Skill.exists?(skill.id)).to be(false)
    end

    it "同じ列の並び順を、0 から連番に詰める(順番は、変えない)" do
      create_skill("A", :unlearned, 0)
      b = create_skill("B", :unlearned, 1)
      create_skill("C", :unlearned, 2)
      create_skill("D", :unlearned, 3)

      SkillDestroyer.new(b.id).call

      expect(Skill.where(status: :unlearned).order(:position).pluck(:name, :position)).to eq([ [ "A", 0 ], [ "C", 1 ], [ "D", 2 ] ])
    end

    it "ほかの列には、影響しない" do
      a = create_skill("A", :unlearned, 0)
      create_skill("X", :learning, 5)
      create_skill("Y", :mastered, 3)

      SkillDestroyer.new(a.id).call

      expect(Skill.where(status: :learning).pluck(:position)).to eq([ 5 ])
      expect(Skill.where(status: :mastered).pluck(:position)).to eq([ 3 ])
    end

    it "習得済みのスキルも、削除できる(習得済みの列を詰める)" do
      a = create_skill("A", :mastered, 0)
      create_skill("B", :mastered, 1)

      SkillDestroyer.new(a.id).call

      expect(Skill.where(status: :mastered).pluck(:name, :position)).to eq([ [ "B", 0 ] ])
    end

    it "存在しない id は、ActiveRecord::RecordNotFound(API では 404)" do
      expect { SkillDestroyer.new(999_999).call }.to raise_error(ActiveRecord::RecordNotFound)
    end

    it "id が、文字列(URL から来る値)でも、削除できる" do
      skill = create_skill("A", :learning, 0)

      expect(SkillDestroyer.new(skill.id.to_s).call).to be(true)
    end
  end
end
