# スキルの追加。追加したスキルは、指定した状態の列の、末尾に置く。
# 並び順の決定と保存は、ロックの中でまとめて行う(BoardLock。同時に追加されても、並び順が重ならない)。
#
#   creator = SkillCreator.new(name: "レジ締め", status: "unlearned")
#   creator.call   # => true(追加できた)/ false(入力が正しくない。creator.skill.errors に理由が入る)
#   creator.skill  # => 追加したスキル
#
# 決めごと(docs/02-機能要件.md の F-02):
# - 習得済みの列には、直接追加できない(習得済みにするには、追加したあとに移動する)。
# - 並び順(position)と習得日(acquired_on)は、サーバーが決める。
class SkillCreator
  MASTERED_MESSAGE = "習得済みの列には、スキルを直接追加できません。未習得か習得中に追加してから、移動してください。".freeze

  attr_reader :skill

  def initialize(attributes)
    @skill = Skill.new(attributes)
  end

  def call
    if skill.mastered?
      skill.errors.add(:base, MASTERED_MESSAGE)
      return false
    end

    BoardLock.synchronize do
      # 状態が正しくないときは、保存の検証でエラーになる(並び順は、仮の 0)
      skill.position = Skill.statuses.key?(skill.status) ? Skill.next_position(skill.status) : 0
      skill.save
    end
  end
end
