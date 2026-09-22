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
| `docs/07-デプロイガイド.md` | AWS へのデプロイのガイド(全5部)。**Phase 4 の作業の前に、必ず読む**。無料の範囲に収めるための、絶対に守ること |
| `docs/08-品質チェック結果.md` | 全体的な品質チェックの結果と、修正の進み具合(Q0〜Q8)。**品質の修正をする前に、読む** |

実装は、`docs/` の仕様に従う。仕様と食い違う変更をする場合は、先にドキュメントを更新する(または、ユーザーに確認する)。

## 起動コマンド

起動方法の詳細は README.md を参照する。

- バックエンド: `cd backend && ./start.sh`(ポート 3001)
- フロントエンド: `cd frontend && ./start.sh`(ポート 3000)

いずれも、ポートが競合している場合は、既存のプロセスを自動で停止してから起動する。

### フロントエンドの操作

フロントエンド(`frontend/`)は、パソコンの Node.js で動かす(Docker は使わない)。次のコマンドは、`frontend/` の中で実行する。

- **まとめて検査: `npm run check`**(ESLint、型検査、テスト、本番用ビルド)。コミット・Pull Request の前に実行し、すべて成功することを確認する
- テスト(Vitest): `npm run test`。書き方の検査: `npm run lint`。型検査: `npm run typecheck`
- 開発サーバーの起動は、必ず `./start.sh` から行う(`npm run dev` を直接実行しない)。`package.json` の `dev` は、`next dev -p 3000 -H 127.0.0.1`(ポートを明示し、自分のパソコンからだけ接続できるようにしている)
- ブラウザでは `http://localhost:3000` を使う(`127.0.0.1` では、バックエンドの CORS の許可に合わず、API を呼べない)
- Next.js 16 の使い方で迷ったときは、付属の説明(`frontend/node_modules/next/dist/docs/`)を読む(以前の版と違う点がある)。`next.config.ts` の `agentRules: false` は、`next dev` が案内ファイルを自動で作るのを止める設定なので、外さない

### バックエンドの操作(起動後)

バックエンドを `start.sh` で起動したあとの操作は、次のコマンドで行う(リポジトリ直下で実行する)。サーバーの起動ではないので、`docker compose exec` を直接使ってよい。

- テスト(RSpec): `docker compose exec web bundle exec rspec`
- マイグレーション: `docker compose exec web bin/rails db:migrate`
- **まとめて検査: `docker compose exec web bin/ci`**。コミット・Pull Request の前に実行し、すべて成功する(`Continuous Integration passed`)ことを確認する。中身は、rubocop、gem の脆弱性検査(bundler-audit)、brakeman、RSpec の4つ(`backend/config/ci.rb`)
- 書き方の検査(rubocop): `docker compose exec web bin/rubocop`。指摘が 0 件であることを確認する。見た目だけの指摘は `-a` で自動で直せる(直したあとは、テストを実行して確認する)
- セキュリティの検査(brakeman): `docker compose exec web bin/brakeman --no-pager`。警告が 0 件であることを確認する。指摘が出たら、内容を確認して直す(問題がないと判断した場合だけ、理由を記録して除外する)
- gem の脆弱性検査: `docker compose exec web bin/bundler-audit`
- Rails のコマンド: `docker compose exec web bin/rails ...`
- MySQL の確認: `docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" skill_map_development'`
- 停止: `docker compose down`(DB のデータは残る。`-v` を付けると消えるので、付けない)

### サーバー起動時のポートに関するルール(必須)

- サーバーは、必ずこれらの `start.sh` 経由で起動する。`npm run dev` や `rails server` を直接実行しない。
- ポートが競合していても、別のポートに一時的に逃がして起動してはならない。必ず、対象のポート(バックエンド 3001、フロントエンド 3000)を使っているプロセスを停止してから、同じポートで起動する。
- フロントエンドは、`next dev -p 3000` のようにポートを明示して起動する。ポートが空いていない場合に、別のポートへ自動で切り替わらず、エラーになるようにする。これにより、誤って別のポートで起動されることを防ぐ。
- バックエンドは、システムの Ruby が古い(2.6.10)ため、Docker Compose(Rails + MySQL)で動かす。`backend/start.sh` の中で `docker compose` を呼び出す。
- サーバーの起動・動作確認が必要な場合は、`.claude/skills/start-dev-servers/SKILL.md` に定義したスキルに従う(起動・動作確認・再起動・停止の手順と、うまくいかないときの対処が書いてある)。

## 開発ルール

### ブランチ運用

- **`main` ブランチに直接変更を加えない。** 作業は必ず、issue ごとに作業用ブランチを作成して行う。
- ブランチは、issue に対応する形で作成する(例: `issue-12`、`feature/12-skill-move`)。issue の番号がわかる名前にする。
- 作業が完了したら、`main` ブランチへは Pull Request を経由してマージする。

### AWS の利用(課金ゼロが必須)

- このアカウントは**無料プラン(クレジット方式)**。**請求を一切発生させない**。**「有料プランへのアップグレード」は、絶対にしない**。AWS Organizations、IAM Identity Center の「有効にする」、Control Tower などは、自動で有料プランになるので、しない(`docs/07-デプロイガイド.md` の 1.2、3.2)。
- 無料プランでは、サーバーやデータベースを動かすと、クレジットが減る可能性が高い。**動かす時間を短くし、使い終わったら、その日のうちに削除する**。
- EC2 は **t3.micro**、RDS は **db.t3.micro**(シングル AZ)を使う(t2.micro は対象外)。
- **AWS のリソースを作る前に、必ず、作成画面の表示をユーザーから見せてもらい、無料の範囲か確認してから、ユーザーに押してもらう**(「無料ゲート」)。私(Claude)は、AWS のリソースを、勝手に作らない・変えない。
- **AWS に関する作業の前に、`docs/07-デプロイガイド.md`(全5部)を必ず読む。** 詳細は `docs/06-技術スタック.md` も参照する。
