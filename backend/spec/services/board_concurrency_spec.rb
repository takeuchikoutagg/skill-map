require "rails_helper"

# 追加・削除・移動・並べ替えが、同時に来ても、順番に処理される(BoardLock)ことの確かめ。
#
# このテストだけ、トランザクションを使わない。スレッドごとに、別のデータベース接続で、本物のコミットをする。
# (ふつうのテストは、1つの接続・1つのトランザクションの中で動くので、ロックの効果も、競合も、確かめられない。)
# 終わったら、テーブルを空にする。
RSpec.describe "ボードの操作の、同時実行" do
  self.use_transactional_tests = false

  before { Skill.delete_all }
  after { Skill.delete_all }

  # 決まり(docs/05-ER図.md の「守るべきルール」)が、守られているか
  def expect_board_consistent
    Skill.statuses.each_key do |status|
      positions = Skill.where(status: status).order(:position, :id).pluck(:position)
      expect(positions).to eq((0...positions.size).to_a), "#{status} の並び順が、0 から連番でない: #{positions.inspect}"
    end
    expect(Skill.where.not(status: :mastered).where.not(acquired_on: nil).count).to eq(0)
    expect(Skill.where(status: :mastered, acquired_on: nil).count).to eq(0)
  end

  # count 個のスレッドを、同時に(全員が揃ってから)動かす。各スレッドで起きた例外を、配列で返す
  def in_threads(count, &block)
    ready = Queue.new
    start = Queue.new
    errors = []
    lock = Mutex.new

    threads = Array.new(count) do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          block.call(index)
        rescue StandardError => e
          lock.synchronize { errors << e }
        end
      end
    end
    count.times { ready.pop }
    count.times { start << true }
    threads.each(&:join)
    errors
  end

  # 接続の数(database.yml の max_connections)より、スレッドを多くしない(このテストの本体の接続の分、1つ引く)
  let(:thread_count) { [ 4, ActiveRecord::Base.connection_pool.db_config.max_connections.to_i - 1 ].min }

  describe "追加" do
    it "同じ列に、同時に追加しても、並び順が、重ならない(重複なし・0 から連番)" do
      5.times do
        Skill.delete_all
        errors = in_threads(thread_count) do |index|
          3.times { |n| SkillCreator.new(name: "S#{index}-#{n}", status: "unlearned").call }
        end

        expect(errors).to be_empty
        expect(Skill.count).to eq(thread_count * 3)
        expect_board_consistent
      end
    end

    it "列が、空のときに、同時に追加しても、例外が出ず、並び順が、重ならない(デッドロックは、やり直される)" do
      10.times do
        Skill.delete_all
        errors = in_threads(thread_count) { |index| SkillCreator.new(name: "S#{index}", status: "learning").call }

        expect(errors).to be_empty
        expect(Skill.count).to eq(thread_count)
        expect_board_consistent
      end
    end
  end

  describe "追加と、ほかの操作の、順番(待たされること)" do
    # 別のスレッドが、ロックを持っている間、追加・削除は、待たされる。ロックを持つスレッドの、操作の結果が、そのあとに、正しく反映される
    def hold_lock_while(&during)
      locked = Queue.new
      release = Queue.new
      holder = Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          BoardLock.synchronize do
            locked << true
            release.pop
            during.call
          end
        end
      end
      locked.pop
      [ holder, release ]
    end

    # 1件以上あるとき、ロックは、その行を止めるので、確実に、順番に処理される。
    # (テーブルが空のときは、InnoDB が、空のところに「すき間ロック」しか取らず、2つの操作は、ロックでは止め合わない。
    #  その場合は、追加の書き込みで、デッドロックが検出されて、やり直される。並び順が重ならないことは、上の「列が、空のとき」のテストで確かめている)
    it "ロックを持つ別の操作が、終わるまで、追加は待たされ、そのあとの状態を見て、並び順を決める" do
      Skill.create!(name: "既存", status: :unlearned, position: 0)
      holder, release = hold_lock_while { SkillCreator.new(name: "先に追加", status: "unlearned").call }
      result = nil
      waiting = Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          creator = SkillCreator.new(name: "待たされた追加", status: "unlearned")
          creator.call
          result = creator.skill
        end
      end

      expect(waiting.join(0.5)).to be_nil # まだ、待たされている(先の操作が、ロックを持っている)
      release << true
      [ holder, waiting ].each(&:join)

      expect(result.position).to eq(2) # 既存(0)と、先に追加されたスキル(1)の、次
      expect(Skill.order(:position).pluck(:name, :position)).to eq([ [ "既存", 0 ], [ "先に追加", 1 ], [ "待たされた追加", 2 ] ])
    end

    it "削除は、ロックを取ったあとの、最新の状態で、並び順を詰める(待っている間に、別の列へ移されても、壊れない)" do
      x = Skill.create!(name: "X", status: :unlearned, position: 0)
      Skill.create!(name: "Y", status: :unlearned, position: 1)
      Skill.create!(name: "Z", status: :learning, position: 0)

      # 先の操作: X を、習得中の先頭へ移す(この間、ロックを持っている)
      holder, release = hold_lock_while { SkillMover.new(Skill.find(x.id), status: "learning", position: 0).call }
      waiting = Thread.new do
        ActiveRecord::Base.connection_pool.with_connection { SkillDestroyer.new(x.id).call }
      end

      expect(waiting.join(0.5)).to be_nil
      release << true
      [ holder, waiting ].each(&:join)

      # X は、削除された。未習得は Y だけ(0)、習得中は Z だけ(0)。どちらも、歯抜けがない
      expect(Skill.order(:status, :position).pluck(:name, :status, :position)).to eq([ [ "Y", "unlearned", 0 ], [ "Z", "learning", 0 ] ])
      expect_board_consistent
    end
  end

  describe "追加・削除・移動・並べ替えを、混ぜて、同時に" do
    it "何度、混ぜて実行しても、決まり(並び順が連番、習得日は習得済みだけ)が、守られる" do
      3.times do |round|
        Skill.delete_all
        statuses = %w[unlearned learning mastered]
        6.times do |i|
          SkillCreator.new(name: "初期#{i}", status: statuses[i % 2], priority: %w[high medium low][i % 3]).call
        end
        Skill.where(status: :learning).limit(1).each { |s| SkillMover.new(s, status: "mastered", position: 0).call }

        errors = in_threads(thread_count) do |index|
          random = Random.new(round * 100 + index) # 毎回、同じ順番になる(失敗したとき、やり直せる)
          10.times do |n|
            case random.rand(4)
            when 0 then SkillCreator.new(name: "新#{index}-#{n}", status: statuses.first(2).sample(random: random)).call
            when 1 then destroy_random(random)
            when 2 then move_random(random, statuses)
            else SkillSorter.new(%w[unlearned learning].sample(random: random)).call
            end
          end
        end

        expect(errors).to be_empty
        expect_board_consistent
      end
    end

    # 消えていた(別のスレッドが、先に削除した)スキルへの操作は、404 になる。それは、正しい動きなので、無視する
    def destroy_random(random)
      id = Skill.pluck(:id).sample(random: random)
      SkillDestroyer.new(id).call if id
    rescue ActiveRecord::RecordNotFound
      nil
    end

    def move_random(random, statuses)
      skill = Skill.order(:id).offset(random.rand([ Skill.count, 1 ].max)).first
      SkillMover.new(skill, status: statuses.sample(random: random), position: random.rand(6)).call if skill
    rescue ActiveRecord::RecordNotFound
      nil
    end
  end

  describe "デッドロックのやり直し" do
    it "デッドロックが、1回起きても、やり直して、成功する" do
      calls = 0
      allow(BoardLock).to receive(:lock_rows).and_wrap_original do |original|
        calls += 1
        raise ActiveRecord::Deadlocked, "わざと起こした失敗" if calls == 1

        original.call
      end

      creator = SkillCreator.new(name: "A", status: "unlearned")

      expect(creator.call).to be(true)
      expect(calls).to eq(2)
      expect(Skill.pluck(:name)).to eq([ "A" ])
    end

    it "何度も続くときは、BoardLock::MAX_ATTEMPTS 回で、あきらめて、例外にする(無限に、やり直さない)" do
      calls = 0
      allow(BoardLock).to receive(:lock_rows) do
        calls += 1
        raise ActiveRecord::Deadlocked, "わざと起こした失敗"
      end

      expect { SkillCreator.new(name: "A", status: "unlearned").call }.to raise_error(ActiveRecord::Deadlocked)

      expect(calls).to eq(BoardLock::MAX_ATTEMPTS)
      expect(Skill.count).to eq(0)
    end

    it "デッドロック以外の例外は、やり直さない" do
      calls = 0
      allow(BoardLock).to receive(:lock_rows) do
        calls += 1
        raise "わざと起こした失敗"
      end

      expect { SkillCreator.new(name: "A", status: "unlearned").call }.to raise_error("わざと起こした失敗")

      expect(calls).to eq(1)
    end
  end

  describe "途中で失敗したとき" do
    it "ブロックの中で、書き込んだあとに、例外が起きたら、その書き込みは、すべて取り消される" do
      Skill.create!(name: "既存", status: :unlearned, position: 0)

      expect do
        BoardLock.synchronize do
          Skill.create!(name: "取り消される", status: :unlearned, position: 1)
          raise "わざと起こした失敗"
        end
      end.to raise_error("わざと起こした失敗")

      expect(Skill.pluck(:name)).to eq([ "既存" ])
    end
  end
end
