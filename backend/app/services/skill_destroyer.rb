# スキルの削除。削除したあと、同じ状態の列の並び順を、0 から連番に詰める。
# スキルの読み込み、削除、並び順の詰め直しは、ロックの中でまとめて行う(BoardLock。
# 同時に移動や追加があっても、古い状態で詰め直したり、ほかの操作の結果を上書きしたりしない)。
#
#   SkillDestroyer.new(id).call   # => true(削除できた)。存在しなければ、ActiveRecord::RecordNotFound
#
# 決めごと(docs/02-機能要件.md の F-04):
# - 削除と振り直しは、まとめて(transaction で)行う。途中で失敗したら、削除もなかったことにする。
# - ほかの状態の列には、影響しない。
class SkillDestroyer
  def initialize(id)
    @id = id
  end

  def call
    BoardLock.synchronize do
      skill = Skill.find(@id) # ロックを取ったあとに読む(待っているあいだに、状態が変わっていることがあるため)
      status = skill.status

      skill.destroy!
      Skill.renumber_positions(status)
    end

    true
  end
end
