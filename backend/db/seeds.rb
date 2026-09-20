# 開発用のサンプルデータ(プロトタイプと同じ内容)。
#   docker compose exec web bin/rails db:seed
#
# 開発環境で、スキルが1件もないときだけ入れる(本番や、すでにデータがあるときは何もしない)。
if Rails.env.development? && Skill.none?
  [
    # 未習得(並び順は、わざと優先度の順になっていない。優先度順の並べ替えの確認用)
    { name: "クレーム対応", note: nil, status: :unlearned, priority: :low, due_date: "2026-12-31", position: 0 },
    { name: "発注書の確認", note: "数量と単価を、注文書と見比べる。", status: :unlearned, priority: :medium, due_date: "2026-11-15", position: 1 },
    { name: "受発注システムの操作", note: "手順書を先に読む。画面の名前と、業務の流れを対応させて覚える。", status: :unlearned, priority: :high, due_date: "2026-09-10", position: 2 },
    # 習得中
    { name: "請求書の発行", note: "締め日に注意。月末は先輩に確認してから発行する。", status: :learning, priority: :medium, due_date: "2026-10-15", position: 0 },
    { name: "月次レポートの作成", note: nil, status: :learning, priority: :high, due_date: "2026-10-31", position: 1 },
    # 習得済み(習得日あり)
    { name: "レジ締め", note: "現金の過不足を必ず二人で確認する。", status: :mastered, priority: :medium, due_date: nil, acquired_on: "2026-09-01", position: 0 }
  ].each { |attributes| Skill.create!(attributes) }

  puts "サンプルのスキルを #{Skill.count} 件、追加しました。"
end
