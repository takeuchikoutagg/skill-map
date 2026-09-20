# スキルのテーブル(docs/05-ER図.md のテーブル定義どおり)
#
# 列(画面の「未習得」「習得中」「習得済み」)は、別のテーブルにせず、
# status(状態)の値で表す。同じ状態の中の並び順は position で表す。
class CreateSkills < ActiveRecord::Migration[8.1]
  def change
    create_table :skills do |t|
      t.string  :name,        null: false, limit: 100   # スキル名(必須、100文字以内)
      t.text    :note                                   # ポイント・考察
      t.integer :status,      null: false, default: 0   # 状態(0:未習得 1:習得中 2:習得済み)
      t.integer :priority,    null: false, default: 1   # 優先度(0:高 1:中 2:低)
      t.date    :due_date                               # 期限
      t.date    :acquired_on                            # 習得日(自動で記録する)
      t.integer :position,    null: false               # 同じ状態の中の並び順(0 始まり)

      t.timestamps
    end

    # ボードを「状態ごと・並び順」に取り出すためのインデックス
    add_index :skills, [ :status, :position ]
  end
end
