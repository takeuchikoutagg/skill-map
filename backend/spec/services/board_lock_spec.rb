require "rails_helper"

# BoardLock の、基本の動き。同時に動かしたときの確かめは、board_concurrency_spec.rb(トランザクションを使わないテスト)で行う。
RSpec.describe BoardLock do
  describe ".synchronize" do
    it "ブロックの結果を、そのまま返す" do
      expect(BoardLock.synchronize { :done }).to eq(:done)
      expect(BoardLock.synchronize { false }).to be(false)
    end

    it "ブロックの中で、すべてのスキルの行を、ロックして(FOR UPDATE)から、実行する" do
      Skill.create!(name: "A", status: :unlearned, position: 0)
      statements = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") { |*, payload| statements << payload[:sql] }

      BoardLock.synchronize { statements << "ブロックの中" }

      ActiveSupport::Notifications.unsubscribe(subscriber)
      lock_index = statements.index { |sql| sql.match?(/FOR UPDATE/i) }
      expect(lock_index).not_to be_nil
      expect(statements.index("ブロックの中")).to be > lock_index
    end

    it "ブロックの例外は、そのまま外に出る" do
      expect { BoardLock.synchronize { raise "わざと起こした失敗" } }.to raise_error("わざと起こした失敗")
    end

    it "外側にトランザクションがあるとき(このテストのように)は、デッドロックでも、やり直さずに、そのまま例外にする" do
      calls = 0

      expect do
        BoardLock.synchronize do
          calls += 1
          raise ActiveRecord::Deadlocked, "わざと起こした失敗"
        end
      end.to raise_error(ActiveRecord::Deadlocked)

      expect(calls).to eq(1)
    end
  end
end
