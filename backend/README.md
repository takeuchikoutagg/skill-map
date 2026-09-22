# backend

skill-map のバックエンド(Ruby on Rails 8、API モード)です。

- 起動・開発の手順は、リポジトリ直下の [README.md](../README.md) と [CLAUDE.md](../CLAUDE.md) を参照してください。
- 仕様は、[docs/02-機能要件.md](../docs/02-機能要件.md)(API 一覧)と、[docs/05-ER図.md](../docs/05-ER図.md)(テーブル定義)を参照してください。
- 本番用の構成は、[docs/06-技術スタック.md](../docs/06-技術スタック.md)、[docs/07-デプロイガイド.md](../docs/07-デプロイガイド.md) を参照してください。

## よく使うコマンド(リポジトリ直下から)

| したいこと | コマンド |
|---|---|
| 起動 | `cd backend && ./start.sh`(ポート 3001) |
| まとめて検査 | `docker compose exec web bin/ci`(rubocop・bundler-audit・brakeman・RSpec) |
| テストだけ | `docker compose exec web bundle exec rspec` |
| マイグレーション | `docker compose exec web bin/rails db:migrate` |
