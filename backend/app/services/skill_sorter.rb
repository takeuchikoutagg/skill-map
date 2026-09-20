# 優先度順の並べ替え。未習得と習得中の列を、高 → 中 → 低の順に並べ替えて、保存する。
# (docs/02-機能要件.md の F-07)
#
#   sorter = SkillSorter.new("unlearned")
#   sorter.call    # => true(並べ替えた)/ false(入力が正しくない。sorter.errors に理由が入る)
#   sorter.skills  # => 並べ替えたあとの、その列のスキル(並び順の順)
#
# 決めごと:
# - 同じ優先度のスキルどうしは、並べ替える前の順番を保つ。
# - 習得済みの列は、並べ替えできない。
# - 並べ替えは、呼んだ時点の1回だけ。あとから追加・移動したスキルを、自動で並べ直すことはしない。
# - ほかの列には、影響しない。
# - 並び順の更新は、まとめて(transaction で)行う。途中で失敗したら、すべてなかったことにする。
class SkillSorter
  SORTABLE_STATUSES = %w[unlearned learning].freeze

  attr_reader :errors, :skills

  def initialize(status)
    @status = status.to_s
    @errors = ActiveModel::Errors.new(Skill.new) # エラーメッセージを、Skill の項目名(日本語)で作るために使う
    @skills = []
  end

  def call
    return false unless valid_request?

    Skill.transaction do
      lock_skills
      sort_and_save
    end
    true
  end

  private

  attr_reader :status

  def valid_request?
    if status.blank?
      errors.add(:status, :blank)
    elsif !Skill.statuses.key?(status)
      errors.add(:status, :inclusion)
    elsif !SORTABLE_STATUSES.include?(status)
      errors.add(:base, "習得済みの列は、優先度順に並べ替えできません。")
    end

    errors.empty?
  end

  # 同時に、移動や並べ替えが起きても、順番に処理する(SkillMover と同じ)
  def lock_skills
    Skill.order(:id).lock.pluck(:id)
  end

  def sort_and_save
    current = Skill.where(status: status).order(:position, :id).to_a

    # 優先度(高 = 0、中 = 1、低 = 2)の順。同じ優先度は、いまの順番(index)で決める
    @skills = current.each_with_index
                     .sort_by { |skill, index| [ Skill.priorities.fetch(skill.priority), index ] }
                     .map(&:first)

    @skills.each_with_index do |skill, new_position|
      save_position(skill, new_position) if skill.position != new_position
    end
  end

  def save_position(skill, new_position)
    Skill.where(id: skill.id).update_all(position: new_position)
    skill.position = new_position
  end
end
