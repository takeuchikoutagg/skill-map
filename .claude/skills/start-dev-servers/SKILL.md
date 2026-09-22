---
name: start-dev-servers
description: skill-map の開発サーバー(バックエンド: ポート 3001、フロントエンド: ポート 3000)を、起動・動作確認・再起動・停止する手順。サーバーを動かす、動作を確かめる、止める、再起動する必要があるときに使う。
---

# 開発サーバーの起動・確認・停止

skill-map の開発サーバーは 2 つある。**必ず、ここに書いた手順(`start.sh`)で扱う。**

| サーバー | 場所 | ポート | 動かし方 |
|---|---|---|---|
| バックエンド(Rails API + MySQL) | `backend/` | **3001** | Docker Compose(`backend/start.sh`) |
| フロントエンド(Next.js) | `frontend/` | **3000** | パソコンの Node.js(`frontend/start.sh`)。Docker は使わない |

## 決まり(必ず守る)

- **サーバーは、`start.sh` から起動する。** `npm run dev`、`rails server`、`docker compose up` などを、直接実行しない。
- **ポートが使われていても、別のポートに逃がして起動しない。** `start.sh` が、使っているプロセスを止めてから、同じポートで起動する。それでも起動できないときは、別のポートを試さず、ユーザーに状況を伝える。
- **Docker 本体(Docker Desktop)は止めない。** `start.sh` も、Docker のプロセスは止めない作りになっている。
- **DB のデータを消さない。** `docker compose down -v` は、`-v` を付けると、DB のデータが消える。**`-v` は付けない。**
- **無関係なプロジェクトを、むやみに止めない。** ただし、`backend/start.sh` は、**3001 番(フロントエンドは 3000 番)を使っているコンテナ・プロセスがあれば、それがどのプロジェクトのものでも、止める**(でないと、同じポートで起動できない)。それ以外の、無関係なポートを使っている、他のプロジェクトのコンテナ(例: `taskboard-postgres`)には、触らない。
- ブラウザでは、`http://localhost:3000` を使う。`127.0.0.1:3000` は、バックエンドの CORS の許可に合わず、API を呼べない。

## 起動

**先にバックエンド、次にフロントエンド**の順に起動する(フロントエンドは、起動したときに、バックエンドから一覧を取得するため)。

### 1. バックエンド

```bash
cd backend && ./start.sh -d
```

- `-d` を付けると、コンテナをバックグラウンドで動かして、コマンドはすぐに戻る(付けないと、ログを表示し続けて、戻らない)
- 初めてのとき・Docker のファイルを変えたときは、イメージの作成に、数分かかる
- 起動の直後は、Rails がまだ準備中なので、次の確認で、200 が返るまで待つ(数秒〜数十秒)

### 2. フロントエンド

```bash
cd frontend && ./start.sh
```

- **サーバーを動かし続けるので、コマンドは戻らない。** Claude Code から動かすときは、バックグラウンドで実行する(Bash ツールの `run_in_background: true`。コマンドの末尾に `&` は付けない。付けると、ツール側は「終わった」と扱い、サーバーの状態が分かりにくくなる)
- `node_modules/` がなければ、`start.sh` が、先に `npm ci` を実行する(初めてのとき)
- 「Ready」と表示されたら、起動している

## 動作確認

```bash
# バックエンド: 200 が返れば OK
curl -s -o /dev/null -w "backend %{http_code}\n" http://localhost:3001/api/v1/skills

# フロントエンド: 200 が返れば OK
curl -s -o /dev/null -w "frontend %{http_code}\n" http://localhost:3000
```

起動の直後は、200 が返るまで、数秒おきに繰り返す(最大 1〜2 分)。

さらに、次を確かめられる。

```bash
# 画面に、スキルボードが出ている(バックエンドがつながっている)か
curl -s http://localhost:3000 | grep -o 'スキルボード\|スキルを取得できませんでした' | sort -u
#   スキルボード                 → 正常(一覧を取得できている)
#   スキルを取得できませんでした → フロントエンドは動いているが、バックエンドにつながっていない

# CORS(ブラウザからの通信の許可): access-control-allow-origin: http://localhost:3000 が返れば OK
curl -s -i -X OPTIONS http://localhost:3001/api/v1/skills/1/move \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: PATCH' \
  -H 'Access-Control-Request-Headers: content-type' | grep -i "^HTTP\|allow-origin"

# どのプロセスが、ポートを使っているか
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN     # Docker のプロセス(com.docker...)が出るのが正常

# コンテナの状態(skill-map-web-1 と skill-map-db-1 が Up)
docker compose ps
```

### ログの見方

| 見たいもの | コマンド・場所 |
|---|---|
| バックエンドの、リクエストと SQL | `docker compose logs web --tail 50`(リポジトリ直下で) |
| MySQL | `docker compose logs db --tail 50` |
| フロントエンドの、サーバー側とブラウザ側のエラー | `frontend/.next/dev/logs/next-development.log`(ブラウザで起きたエラーも、ここに残る) |

## 停止

```bash
# バックエンド(リポジトリ直下で。DB のデータは残る。-v は付けない)
docker compose down

# フロントエンド(3000 番を使っているプロセスだけを止める。Docker のプロセスは対象外)
lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill
```

停止のあと、`lsof -nP -iTCP:3000 -sTCP:LISTEN` と `lsof -nP -iTCP:3001 -sTCP:LISTEN` が、何も表示しなければ、止まっている(3001 は、Docker のプロセスが残っていても、コンテナが止まっていれば、応答しない)。

## 再起動

もう一度、`start.sh` を実行するだけでよい(古いプロセスやコンテナは、`start.sh` が止める)。手動で止める必要はない。

- バックエンド: `cd backend && ./start.sh -d`
- フロントエンド: `cd frontend && ./start.sh`(バックグラウンドで実行)

## うまくいかないとき

| 症状 | 原因と対応 |
|---|---|
| 「ポート ○○ が空きませんでした」で、起動できない | `start.sh` が、使っているプロセスを表示している。ユーザーのほかの作業で使っているものかもしれない。**別のポートに逃がさず**、何が使っているかを、ユーザーに伝える |
| 画面に「スキルを取得できませんでした」と出る | フロントエンドは動いているが、バックエンドにつながっていない。バックエンドを起動する(または起動の完了を待つ)。`curl http://localhost:3001/api/v1/skills` が 200 かを確かめる |
| ブラウザで、追加・移動などが失敗する(画面は出ている) | `127.0.0.1:3000` で開いていないか(`localhost:3000` を使う)。CORS の確認(上の `OPTIONS` のコマンド)。バックエンドのログを見る |
| フロントエンドが、急に落ちた・画面が壊れた | **`git checkout` などでブランチを切り替えると、動いている `next dev` が壊れる**ことがある。`./start.sh` で、再起動する |
| バックエンドが起動しない(`unhealthy` など) | `docker compose logs db --tail 50` と `docker compose logs web --tail 50` を見る。MySQL の準備に時間がかかっているだけのことも多い。数十秒待つ |
| Docker が動いていない | Docker Desktop を起動する(私から止めたり、再起動したりしない)。ユーザーに、起動をお願いする。**バックエンドは、Docker が要る**ので、`backend/start.sh` は、Docker が動いていないと、そのまま失敗する(意図した動き)。**フロントエンドは、Docker がなくても動く**ので、`frontend/start.sh` は、Docker が動いていなければ、ポートの確認だけ省いて、そのまま起動する |
| データを空にしたい・作り直したい | 勝手に消さない。DB のデータが消える操作(`down -v` など)は、ユーザーの了承を得てから行う |

## この手順で確かめた内容

この手順は、実際に、次の順で実行して、書いたとおりの結果になることを確認して書いた: 停止 → バックエンドの起動 → フロントエンドの起動 → 動作確認 → 再起動。
