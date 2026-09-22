require "rails_helper"
require "yaml"
require "erb"

# 本番(production)の、DB の接続先の設定(config/database.yml)。
# ユーザー名は、開発と同じ環境変数(DB_USER)で受け取り、未設定なら "backend"(H5②)。
# RSpec 自体は test 環境で動くので、config/database.yml を、ERB として、直接読み込んで確かめる。
RSpec.describe "config/database.yml(production)" do
  def production_config(db_user: nil)
    Bundler.with_original_env do
      if db_user.nil?
        ENV.delete("DB_USER")
      else
        ENV["DB_USER"] = db_user
      end
      yaml = ERB.new(File.read(Rails.root.join("config/database.yml"))).result
      YAML.unsafe_load(yaml).fetch("production")
    end
  ensure
    ENV.delete("DB_USER") if db_user.nil?
  end

  it "DB_USER が指定されていなければ、既定のユーザー名は backend" do
    expect(production_config(db_user: nil)["username"]).to eq("backend")
  end

  it "DB_USER が指定されていれば、それを使う(RDS の、実際のユーザー名に合わせられる)" do
    expect(production_config(db_user: "rds_user")["username"]).to eq("rds_user")
  end

  it "データベース名は backend_production" do
    expect(production_config["database"]).to eq("backend_production")
  end
end
