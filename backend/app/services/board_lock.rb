# ボードの操作(追加・削除・移動・並べ替え)を、1つずつ、順番に処理するための、共通のロック。
# 並び順は「同じ状態の中で、0 から連番」という決まりがあるので、同時に2つの操作が、並び順を触ってはいけない。
#
#   BoardLock.synchronize do
#     # ここでは、ほかの操作(追加・削除・移動・並べ替え)は、待たされる。読み込みも、この中で行う
#   end
#
# 仕組み:
# - トランザクションを開始して、すべてのスキルの行をロックする(id の順にロックするので、お互いを待ち合わない)。
#   スキルは多くても数百件なので、これで十分。InnoDB は、範囲をロックする読み取りで、すき間(追加される場所)もロックするため、
#   同時の「追加」も、待たされる。
# - スキルが1件もないとき、同時に2つの「追加」が来ると、すき間のロックどうしが、追加のところで待ち合って、デッドロックになりうる。
#   その場合は、MySQL がどちらか一方を取り消すので、最大 MAX_ATTEMPTS 回まで、最初からやり直す。
#   (外側にトランザクションがあるとき、例えば、テストのトランザクションの中では、やり直せないので、そのまま例外にする。)
# - 複数ユーザーにするときは、「全スキルの行」を、「そのユーザーの行」のロックに変える(この1か所だけ)。
module BoardLock
  MAX_ATTEMPTS = 3

  def self.synchronize(&block)
    attempts = 0
    begin
      Skill.transaction do
        lock_rows
        block.call
      end
    rescue ActiveRecord::Deadlocked
      attempts += 1
      raise if attempts >= MAX_ATTEMPTS || Skill.lease_connection.transaction_open?

      retry
    end
  end

  def self.lock_rows
    Skill.order(:id).lock.pluck(:id)
  end
end
