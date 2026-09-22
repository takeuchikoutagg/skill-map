require "rails_helper"

# config/database.yml の、ロックを待つ時間の設定。
# 既定の 50 秒だと、画面の通信の時間切れ(10 秒)より長く、待たされ続けるので、5 秒にしてある(待ちきれなければ 503)。
RSpec.describe "データベースの設定" do
  it "ロックを待つ時間(innodb_lock_wait_timeout)は、5 秒" do
    timeout = Skill.with_connection { |connection| connection.select_value("SELECT @@innodb_lock_wait_timeout") }

    expect(timeout.to_i).to eq(5)
  end
end
