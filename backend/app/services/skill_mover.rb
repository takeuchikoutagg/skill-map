# スキルの移動(列間の移動と、列内の並び替え)。
# 並び順と習得日の更新は、ここで1か所にまとめて行う(docs/06-技術スタック.md の設計の方針)。
#
#   mover = SkillMover.new(skill, status: "mastered", position: 0)
#   mover.call  # => true(移動できた)/ false(入力が正しくない。skill.errors に理由が入る)
#
# 決めごと(docs/02-機能要件.md の F-05、F-06):
# - status は、移動先の状態(列)。position は、移動先の列の中での位置(0 始まり)。
#   position は「移動したあとの位置」で、移動するスキル自身は数えない。
#   列の長さより大きければ、末尾に置く。
# - 移動元と移動先の両方で、並び順を 0 から連番に振り直す(順番は変えない)。
# - 習得日は、サーバーが決める。
#     習得済み以外 → 習得済み: 今日の日付を記録する
#     習得済み → 習得済み以外: 消す
#     習得済み内の並び替え、習得済み以外の列どうしの移動: 変えない
# - 並び順・状態・習得日の更新は、まとめて(transaction で)行う。途中で失敗したら、すべてなかったことにする。
class SkillMover
  def initialize(skill, status:, position:, today: Date.current)
    @skill = skill
    @status = status.to_s
    @position = position.to_s.match?(/\A\d+\z/) ? position.to_s.to_i : nil
    @today = today
  end

  def call
    return false unless valid_request?

    Skill.transaction do
      lock_skills
      move
    end
    true
  end

  private

  attr_reader :skill, :status, :position, :today

  # 入力のチェック。正しくなければ、skill.errors に日本語の理由を入れる
  def valid_request?
    skill.errors.clear

    if status.blank?
      skill.errors.add(:status, :blank)
    elsif !Skill.statuses.key?(status)
      skill.errors.add(:status, :inclusion)
    end
    skill.errors.add(:position, :invalid_position) if position.nil?

    skill.errors.empty?
  end

  # スキルは多くても数百件なので、すべての行をロックして、同時に2つの移動が起きても、順番に処理する。
  # (id の順にロックするので、お互いを待ち合うことはない。)
  def lock_skills
    Skill.order(:id).lock.pluck(:id)
    skill.reload   # ロックを取ったあとの、最新の状態を読み直す
  end

  def move
    from_status = skill.status

    # 移動先の列(移動するスキルは除く)に、指定の位置で差し込み、0 から連番にする
    siblings = Skill.where(status: status).where.not(id: skill.id).order(:position, :id).to_a
    index = [ position, siblings.size ].min

    skill.assign_attributes(status: status, acquired_on: next_acquired_on(from_status), position: index)
    ordered = siblings.insert(index, skill)

    skill.save!
    ordered.each_with_index do |member, new_position|
      next if member.equal?(skill) || member.position == new_position

      Skill.where(id: member.id).update_all(position: new_position)
    end

    # 列が変わったときは、移動元の列の歯抜けを詰める
    Skill.renumber_positions(from_status) if from_status != status
  end

  def next_acquired_on(from_status)
    to_mastered = status == "mastered"

    if to_mastered && from_status != "mastered"
      today
    elsif !to_mastered
      nil
    else
      skill.acquired_on
    end
  end
end
