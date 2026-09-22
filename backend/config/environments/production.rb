require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # セキュリティヘッダー(X-Frame-Options、X-Content-Type-Options など)は、Rails の既定では付けない。
  # 前段の Nginx が、すべての応答に付けるため(nginx/nginx.conf、docs/08-品質チェック結果.md の M11)。
  # 付ける場所を1つにしないと、両方が付いて、値が食い違うことがある(実際に、Rails の既定の
  # X-Frame-Options: SAMEORIGIN と、Nginx の X-Frame-Options: DENY が、両方付くことを確認した)。
  config.action_dispatch.default_headers.clear

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # HTTPS(SSL)を使うかどうか。既定は、いまの構成(Nginx が、HTTP だけを受ける)に合わせて false。
  # 前段の Nginx が、HTTPS を受けて、Rails には HTTP で転送するようになったら、環境変数を true にする。
  # true のまま、HTTP しかない構成で動かすと、HTTPS への無限リダイレクトになるので、注意する
  # (docs/07-デプロイガイド.md P1 で、実際に curl して確認した)。
  force_ssl = ENV.fetch("FORCE_SSL", "false") == "true"

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  config.assume_ssl = force_ssl

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.force_ssl = force_ssl

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  # config.cache_store = :mem_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # config.active_job.queue_adapter = :resque

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # Enable DNS rebinding protection and other `Host` header attacks.
  # config.hosts = [
  #   "example.com",     # Allow requests from example.com
  #   /.*\.example\.com/ # Allow requests from subdomains like `www.example.com`
  # ]
  #
  # Skip DNS rebinding protection for the default health check endpoint.
  # config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  # config.hosts は、設定しない(あえて)。EC2 のパブリック DNS は、インスタンスを作り直すたびに変わり、
  # 固定しづらい。このアプリは、EC2 のセキュリティグループで、通信できる相手(自分の IP だけ)を絞っているので、
  # Host ヘッダーの検証がなくても、外部から任意のホストで叩かれるリスクは、限定的(docs/07-デプロイガイド.md 2.3)。
  # 将来、ドメインを固定するなら、ここに、そのホスト名を設定する。
end
