# スキル。状態(status)によって、ボードのどの列に表示されるかが決まる。
class Skill < ApplicationRecord
  # 状態: 画面の列にあたる。DB には数字で保存され、コードでは名前で扱える
  #   Skill.unlearned  # 未習得のスキルだけを取り出す
  #   skill.mastered?  # 習得済みかどうか
  enum :status, { unlearned: 0, learning: 1, mastered: 2 }, validate: true

  # 優先度: 高 / 中 / 低
  enum :priority, { high: 0, medium: 1, low: 2 }, validate: true

  # スキル名の前後の空白は、取り除いて保存する(全角スペースも。Ruby の strip は半角の空白しか取らないため)
  normalizes :name, with: ->(name) { name.gsub(/\A[[:space:]]+|[[:space:]]+\z/, "") }

  # ポイント・考察は、空文字("")を、空(nil)として保存する(docs/02-機能要件.md の「空で消せる」に合わせる)。
  # 空文字のままだと、「消えた」ことを、null と "" のどちらでも表せてしまい、画面側の判定が、揺れるため。
  normalizes :note, with: ->(note) { note.presence }

  validates :name, presence: true, length: { maximum: 100 }
  validates :note, length: { maximum: 5000 }
  validates :position, presence: true,
                       numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :due_date_must_be_a_date
  validate :acquired_on_matches_status

  # MySQL の DATE 型で扱える、年の範囲(DATE '1000-01-01' 〜 '9999-12-31')
  DATE_YEAR_RANGE = 1000..9999

  # 同じ状態の列の、末尾に置くときの並び順(列が空なら 0)
  def self.next_position(status)
    (where(status: status).maximum(:position) || -1) + 1
  end

  # 同じ状態の列の並び順を、0 から連番に振り直す(歯抜けを詰める)。
  # いまの並び順(同じなら id)の順番は、変えない。削除のあとなどに使う。
  def self.renumber_positions(status)
    where(status: status).order(:position, :id).each_with_index do |skill, index|
      skill.update_columns(position: index) if skill.position != index
    end
  end

  private

  # 習得日のルール(docs/05-ER図.md の「守るべきルール」)
  #   習得済みのスキルは、習得日が入っている。習得済みでないスキルは、習得日が空。
  # 習得日は、スキルを移動するときに、サーバーが自動で記録・消去する(SkillMover)。
  def acquired_on_matches_status
    if mastered?
      errors.add(:acquired_on, :blank) if acquired_on.blank?
    elsif acquired_on.present?
      errors.add(:acquired_on, :only_for_mastered)
    end
  end

  # 期限は、"YYYY-MM-DD" の形の文字列だけを受け付ける(docs/02-機能要件.md)。
  # 読めない値("abc")、存在しない日付("2026-02-30")、この形でない値("2026/10/31"、日時つきなど)は、
  # 黙って空にせず、エラーにする(Rails は、日付にできない値を、エラーを出さずに nil にしてしまうため)。
  # MySQL の DATE 型の範囲外の年(西暦1000年より前、9999年より後)も、エラーにする。
  def due_date_must_be_a_date
    raw = due_date_before_type_cast
    return if raw.blank?

    if raw.is_a?(String) && !raw.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      errors.add(:due_date, :invalid)
      return
    end

    if due_date.blank? || !DATE_YEAR_RANGE.cover?(due_date.year)
      errors.add(:due_date, :invalid)
    end
  end
end
