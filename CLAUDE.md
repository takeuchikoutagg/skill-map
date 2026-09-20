# CLAUDE.md

このファイルは、このリポジトリで作業する際のガイドラインです。

## プロジェクト概要

Trello を参考にした、個人用のスキル管理アプリ。「未習得 / 習得中 / 習得済み」の列にスキルカードを並べ、習得の進み具合を管理する。
技術スタックは Next.js(App Router)+ TypeScript + Ruby on Rails(API モード)+ MySQL。デプロイは AWS(EC2 + RDS)。
詳細は README.md と `docs/` を参照する。

| ドキュメント | 内容 |
|---|---|
| `docs/01-要件定義.md` | 背景、目的、スコープ、制約 |
| `docs/02-機能要件.md` | 機能一覧、習得日のルール、API 一覧 |
| `docs/03-画面一覧.md` | 画面の構成、表示項目、操作 |
| `docs/04-ユースケース.md` | ユースケースの記述 |
| `docs/05-ER図.md` | テーブル定義、守るべきルール |
| `docs/06-技術スタック.md` | 構成図、AWS のコスト対策、設計の方針 |

実装は、`docs/` の仕様に従う。仕様と食い違う変更をする場合は、先にドキュメントを更新する(または、ユーザーに確認する)。

## 起動コマンド

起動方法の詳細は README.md を参照する。

- バックエンド: `cd backend && ./start.sh`(ポート 3001)
- フロントエンド: `cd frontend && ./start.sh`(ポート 3000)

いずれも、ポートが競合している場合は、既存のプロセスを自動で停止してから起動する。

> バックエンドの `start.sh` は作成済み。フロントエンドの `start.sh` は、フロントエンドの実装(Phase 3)で作成する。作成するまでは、フロントエンドのコマンドは使えない。

### バックエンドの操作(起動後)

バックエンドを `start.sh` で起動したあとの操作は、次のコマンドで行う(リポジトリ直下で実行する)。サーバーの起動ではないので、`docker compose exec` を直接使ってよい。

- テスト(RSpec): `docker compose exec web bundle exec rspec`
- マイグレーション: `docker compose exec web bin/rails db:migrate`
- 書き方の検査(rubocop): `docker compose exec web bin/rubocop`。指摘が 0 件であることを確認してからコミットする。見た目だけの指摘は `-a` で自動で直せる(直したあとは、テストを実行して確認する)
- Rails のコマンド: `docker compose exec web bin/rails ...`
- MySQL の確認: `docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" skill_map_development'`
- 停止: `docker compose down`(DB のデータは残る。`-v` を付けると消えるので、付けない)

### サーバー起動時のポートに関するルール(必須)

- サーバーは、必ずこれらの `start.sh` 経由で起動する。`npm run dev` や `rails server` を直接実行しない。
- ポートが競合していても、別のポートに一時的に逃がして起動してはならない。必ず、対象のポート(バックエンド 3001、フロントエンド 3000)を使っているプロセスを停止してから、同じポートで起動する。
- フロントエンドは、`next dev -p 3000` のようにポートを明示して起動する。ポートが空いていない場合に、別のポートへ自動で切り替わらず、エラーになるようにする。これにより、誤って別のポートで起動されることを防ぐ。
- バックエンドは、システムの Ruby が古い(2.6.10)ため、Docker Compose(Rails + MySQL)で動かす。`backend/start.sh` の中で `docker compose` を呼び出す。
- サーバーの起動・動作確認が必要な場合は、`.claude/skills/start-dev-servers/SKILL.md` に定義したスキルに従う(実装時に作成する)。

## 開発ルール

### ブランチ運用

- **`main` ブランチに直接変更を加えない。** 作業は必ず、issue ごとに作業用ブランチを作成して行う。
- ブランチは、issue に対応する形で作成する(例: `issue-12`、`feature/12-skill-move`)。issue の番号がわかる名前にする。
- 作業が完了したら、`main` ブランチへは Pull Request を経由してマージする。

### AWS の利用(課金ゼロが必須)

- 無料利用枠の範囲内で運用し、課金を一切発生させない。
- このアカウントでは t2.micro が無料枠の対象外。EC2 は **t3.micro**、RDS は **db.t3.micro**(シングル AZ)を使う。
- リソースを作る前に、無料枠の対象かを確認する。使い終わったリソースは放置せず、削除する。
- 詳細は `docs/06-技術スタック.md` を参照する。
