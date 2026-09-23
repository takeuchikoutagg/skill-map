# skill-map

「誰がどのスキルを習得しているか」を可視化するスキル管理アプリです。
トレロのようなボード上で、スキルを「未習得 → 習得中 → 習得済み」へドラッグ&ドロップで移動しながら、習得の進み具合を管理します。

## デモ動画

実際に AWS(EC2 + RDS)へデプロイした環境で、操作している様子です(追加・編集・ドラッグ&ドロップ・優先度順の並べ替え・削除)。

**[▶ 動画を再生する](docs/assets/demo.mp4)**(GitHub 上で、ダウンロードせずに、そのまま再生できます)

## 背景

現職は人手不足で、人材育成が十分に進んでいません。
スキルの習得状況を見える化し、習得済みの人が新人を指導できるようにすることで、少ない人数でもスキルの習得を進められるようにするのが目的です。

まずは**単一ユーザー(自分のスキルのみ)**から始め、将来的に複数ユーザーへ拡張します。

## 主な機能

- 1画面のスキルボード(画面遷移なし)。列は「未習得」「習得中」「習得済み」の3列で固定です
- スキルの追加・編集・削除
  - 項目: スキル名 / ポイント・考察 / 優先度(高・中・低) / 期限 / 習得日
- ドラッグ&ドロップによる、列間の移動と列内の並び替え
- **優先度順の並べ替え**: 「未習得」「習得中」の列で、ボタンを押すと高 → 中 → 低の順に並べ替えます
- **習得日の自動記録**: スキルを「習得済み」列に移動した日を自動で記録します(編集不可。他の列へ戻すと消えます)。習得日は「習得済み」列のカードにだけ表示します

## 技術スタック

| 領域 | 技術 |
|---|---|
| フロントエンド | Next.js(TypeScript) |
| バックエンド | Ruby on Rails(API モード) |
| データベース | MySQL |
| デプロイ | AWS(EC2 + RDS、無料利用枠の範囲内) |

## ドキュメント

設計ドキュメントは [docs/](docs/) にまとめています。

| ドキュメント | 内容 |
|---|---|
| [01. 要件定義](docs/01-要件定義.md) | 背景・課題、目的、スコープ、制約、用語 |
| [02. 機能要件](docs/02-機能要件.md) | 機能一覧と詳細、習得日のルール、非機能要件、API 一覧 |
| [03. 画面一覧](docs/03-画面一覧.md) | ワイヤーフレーム、表示項目、操作、画面遷移図 |
| [04. ユースケース](docs/04-ユースケース.md) | ユースケース図と記述、習得日の状態遷移 |
| [05. ER図](docs/05-ER図.md) | ER図、テーブル定義、守るべきルール、将来の拡張 |
| [06. 技術スタック](docs/06-技術スタック.md) | 技術一覧、システム構成図、AWS のコスト対策、設計の方針 |
| [07. デプロイガイド](docs/07-デプロイガイド.md) | AWS へのデプロイのガイド(全5部: 絶対に守ること・費用の仕組み / 全体像と用語 / 事前準備 / 段取り / 後片付け・緊急時) |
| [08. 品質チェック結果](docs/08-品質チェック結果.md) | 全体的な品質チェックの結果(実害のある不具合 3 件、ほか)と、修正の進み具合 |

## プロトタイプ

実装の前に、画面と操作を確認するための、動くプロトタイプです([prototype/](prototype/))。

- **見方**: `prototype/index.html` を、パソコンのブラウザで開くだけです(インストールやサーバーは要りません)
- **できること**: ドラッグ&ドロップでの移動と並び替え、スキルの追加・編集・削除、優先度順の並べ替え、習得日の自動記録
- **データ**: 見ているブラウザの中だけに保存されます。ほかの人や端末とは共有されません。「サンプルデータに戻す」で、最初の状態に戻せます
- **注意**: ドラッグ&ドロップは、パソコンのブラウザ向けです(スマートフォンなどのタッチ操作には未対応)
- **人に渡すとき**: `prototype/` フォルダごと渡してください(4つのファイルが必要です)

## 開発環境(バックエンド)

Rails(API モード)と MySQL は、Docker で動かします。パソコンに Ruby や MySQL を入れる必要はありません。

**前提**: Docker Desktop が起動していること

| やりたいこと | コマンド(リポジトリ直下で実行) |
|---|---|
| 起動する | `cd backend && ./start.sh`(画面に Rails のログが出ます。止めるときは Ctrl + C) |
| 裏で起動する | `cd backend && ./start.sh -d` |
| 動作を確認する | `curl http://localhost:3001/up`(200 が返れば OK) |
| 停止する | `docker compose down`(DB のデータは残ります) |
| テストを実行する | `docker compose exec web bundle exec rspec` |
| テーブルを作る・更新する | `docker compose exec web bin/rails db:migrate` |
| サンプルのスキルを入れる(開発用) | `docker compose exec web bin/rails db:seed`(スキルが1件もないときだけ、6件入ります) |
| スキルの一覧を見る | `curl http://localhost:3001/api/v1/skills`(ブラウザで開いてもよい) |
| スキルを追加する | `curl -X POST http://localhost:3001/api/v1/skills -H "Content-Type: application/json" -d '{"name":"レジ締め","status":"learning"}'` |
| スキルを編集する | `curl -X PATCH http://localhost:3001/api/v1/skills/1 -H "Content-Type: application/json" -d '{"priority":"high"}'`(`1` は、編集するスキルの id) |
| スキルを削除する | `curl -X DELETE http://localhost:3001/api/v1/skills/1`(`1` は、削除するスキルの id。同じ列の並び順は詰まります) |
| スキルを移動する | `curl -X PATCH http://localhost:3001/api/v1/skills/1/move -H "Content-Type: application/json" -d '{"status":"mastered","position":0}'`(習得済みへ移すと、習得日が記録されます) |
| 優先度順に並べ替える | `curl -X POST http://localhost:3001/api/v1/skills/sort -H "Content-Type: application/json" -d '{"status":"unlearned"}'`(`unlearned` か `learning`。高 → 中 → 低に並びます) |
| 書き方を検査する(rubocop) | `docker compose exec web bin/rubocop`(`0 offenses` = 指摘なし。見た目だけの指摘は、`-a` を付けると自動で直ります) |
| セキュリティを検査する(brakeman) | `docker compose exec web bin/brakeman --no-pager`(`No warnings found` = 警告なし。危険な書き方(SQL インジェクションなど)を見つけます) |
| 使っている gem の脆弱性を検査する | `docker compose exec web bin/bundler-audit`(`No vulnerabilities found` = 問題なし) |
| **まとめて検査する**(コミット・Pull Request の前に) | `docker compose exec web bin/ci`(rubocop、gem の脆弱性、brakeman、RSpec を、順に実行。すべて成功すれば `Continuous Integration passed`) |
| Rails を再起動する | `docker compose restart web`(`app/` の下に新しいフォルダを作ったときなど。読み込まれないときに使います) |
| MySQL の中を見る | `docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" skill_map_development'` |

- **ポート**: API は `http://localhost:3001` で動きます(自分のパソコンからだけ接続できます)。
- **`start.sh` の動き**: ポート 3001 を別のものが使っていると、それを止めてから、同じ 3001 番で起動します(別のポートには逃げません)。止めるのは、このプロジェクトのコンテナ、3001 番を使っている他の Docker コンテナ、Docker 以外のプロセスです。Docker Desktop 本体は止めません。
- **設定**: 既定の値で動きます。変えたいときは、`.env.example` を `.env` にコピーして書き換えます(`.env` は Git に入りません)。
- **DB のデータを消すとき**: `docker compose down -v` で、DB のデータも消えます。普段は付けないでください。

## 開発環境(フロントエンド)

画面(Next.js)は、パソコンの Node.js で動かします(Docker は使いません)。

**前提**: Node.js 20.9 以上(24 で確認しています)。スキルは、バックエンド(API)から取得して表示するので、**バックエンドも起動しておきます**(止まっていると、「スキルを取得できませんでした」と表示されます)。

| やりたいこと | コマンド(`frontend/` の中で実行) |
|---|---|
| 起動する | `cd frontend && ./start.sh`(初めてのときは、部品のインストールも自動で行います。止めるときは Ctrl + C) |
| ブラウザで開く | http://localhost:3000 |
| テストを実行する | `npm run test`(`npm run test:watch` にすると、ファイルを変えるたびに、自動で再実行します) |
| **まとめて検査する**(コミット・Pull Request の前に) | `npm run check`(ESLint、型検査、テスト、本番用ビルドを、順に実行) |
| 個別に検査する | `npm run lint`(書き方)、`npm run typecheck`(型) |

- **`localhost:3000` で開いてください。** `127.0.0.1:3000` では、API を呼ぶ機能が、動かなくなります(バックエンドが、`http://localhost:3000` からの通信だけを許可しているため)。
- **ポート**: 3000 番を別のものが使っていると、止めてから、同じ 3000 番で起動します(別のポートには逃げません。Docker 本体は止めません)。
- **自分のパソコンからだけ接続できます**(開発サーバーは、`127.0.0.1` で受け付けます)。
- **設定**: 既定の値で動きます。変えたいときは、`frontend/.env.example` を `.env.local` にコピーして書き換えます(`.env.local` は Git に入りません)。
- **利用情報の送信**: Next.js は、初期設定で、匿名の利用情報を送信します。止めるときは、`npx next telemetry disable` を実行します。

## 開発の進め方

| 段階 | 内容 | 状況 |
|---|---|---|
| Phase 0 | リポジトリの準備 | 完了 |
| Phase 1 | ドキュメントの作成 | 完了 |
| Phase 2 | バックエンド(Rails API、MySQL、テスト) | 完了(API 6本、rubocop・brakeman の検査まで) |
| Phase 3 | フロントエンド(Next.js) | 完了(ボードの表示、スキルの追加・編集・削除、ドラッグ&ドロップでの移動、優先度順の並べ替え、仕上げ) |
| Phase 4 | AWS(EC2 + RDS)へのデプロイ | 完了(Terraform でコード化。実際に EC2 + RDS を構築し、動作確認後、削除まで実施。詳細は [デプロイガイド](docs/07-デプロイガイド.md)) |

## 今後の拡張

- ユーザー認証と、複数ユーザーでのスキルマップ
- 習得済みの人を「指導できる人」として、スキルごとに検索
- チーム全体のスキル一覧と、不足しているスキルの可視化
