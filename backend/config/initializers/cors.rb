# Be sure to restart your server when you modify this file.

# フロントエンド(Next.js)から API を呼べるようにする(CORS)。
# 許可するオリジンは、環境変数 CORS_ORIGINS(カンマ区切り)で指定する。
# 既定は、開発中の Next.js(http://localhost:3000)だけ。
#
# 本番は Nginx が同じオリジンで振り分けるため、CORS は使わない想定(docs/06-技術スタック.md)。
#
# Read more: https://github.com/cyu/rack-cors

allowed_origins = ENV.fetch("CORS_ORIGINS", "http://localhost:3000").split(",").map(&:strip).reject(&:empty?)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*allowed_origins)

    resource "*",
      headers: :any,
      methods: [ :get, :post, :patch, :delete, :options ]
  end
end
