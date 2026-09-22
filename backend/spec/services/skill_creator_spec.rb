require "rails_helper"

RSpec.describe SkillCreator do
  def create_skill(name, status, position)
    Skill.create!(name: name, status: status, position: position)
  end

  describe "#call" do
    it "追加できたら true を返し、追加したスキルを skill で読める" do
      creator = SkillCreator.new(name: "レジ締め", status: "unlearned", priority: "high")

      expect(creator.call).to be(true)
      expect(creator.skill).to be_persisted
      expect(creator.skill).to have_attributes(name: "レジ締め", status: "unlearned", priority: "high", position: 0, acquired_on: nil)
    end

    it "その状態の列の、末尾に置く(ほかの列の並び順には、影響されない)" do
      create_skill("A", :unlearned, 0)
      create_skill("B", :unlearned, 1)
      create_skill("C", :learning, 0)

      creator = SkillCreator.new(name: "D", status: "unlearned")
      creator.call

      expect(creator.skill.position).to eq(2)
      expect(SkillCreator.new(name: "E", status: "learning").tap(&:call).skill.position).to eq(1)
    end

    it "列が空なら、並び順は 0" do
      creator = SkillCreator.new(name: "A", status: "learning")

      creator.call

      expect(creator.skill.position).to eq(0)
    end

    it "習得済みには、直接追加できない(false を返し、理由を skill.errors に入れ、何も保存しない)" do
      creator = SkillCreator.new(name: "A", status: "mastered")

      expect(creator.call).to be(false)
      expect(creator.skill.errors.full_messages).to eq([ SkillCreator::MASTERED_MESSAGE ])
      expect(Skill.count).to eq(0)
    end

    it "入力が正しくないときは、false を返し、項目ごとの理由を入れ、何も保存しない" do
      creator = SkillCreator.new(name: "", status: "unlearned", priority: "low", due_date: "2026-02-30")

      expect(creator.call).to be(false)
      expect(creator.skill.errors.attribute_names).to contain_exactly(:name, :due_date)
      expect(Skill.count).to eq(0)
    end

    it "状態が、決まった値でないときも、false を返し、理由を入れる(壊れない)" do
      creator = SkillCreator.new(name: "A", status: "bogus")

      expect(creator.call).to be(false)
      expect(creator.skill.errors.attribute_names).to include(:status)
      expect(Skill.count).to eq(0)
    end

    it "状態が、空・ないときも、壊れない" do
      creator = SkillCreator.new(name: "A", status: nil)

      expect(creator.call).to be(false)
      expect(Skill.count).to eq(0)
    end

    it "並び順と習得日は、渡されても、サーバーが決める(渡した値は、使われない)" do
      create_skill("A", :unlearned, 0)

      creator = SkillCreator.new(name: "B", status: "unlearned")
      creator.call

      expect(creator.skill).to have_attributes(position: 1, acquired_on: nil)
    end
  end
end
