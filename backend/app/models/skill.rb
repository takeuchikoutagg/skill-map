# スキル。状態(status)によって、ボードのどの列に表示されるかが決まる。
class Skill < ApplicationRecord
  # 状態: 画面の列にあたる。DB には数字で保存され、コードでは名前で扱える
  #   Skill.unlearned  # 未習得のスキルだけを取り出す
  #   skill.mastered?  # 習得済みかどうか
  enum :status, { unlearned: 0, learning: 1, mastered: 2 }, validate: true

  # 優先度: 高 / 中 / 低
  enum :priority, { high: 0, medium: 1, low: 2 }, validate: true

  validates :name, presence: true, length: { maximum: 100 }
  validates :note, length: { maximum: 5000 }
  validates :position, presence: true,
                       numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
