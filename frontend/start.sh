#!/usr/bin/env bash
# フロントエンド(Next.js)を、ポート 3000 で起動する。
#
# ポートが使われていても、別のポートに逃がして起動しない。
# 使っているものを止めてから、同じ 3000 番で起動する(CLAUDE.md のルール)。
#
# 使い方: cd frontend && ./start.sh
#   追加の引数は next dev に渡す

set -euo pipefail

PORT=3000
cd "$(dirname "$0")"   # frontend/ へ

port_pids() {
  lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

echo "==> ポート ${PORT} を使っている Docker コンテナがあれば止めます"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  container_ids=$(docker ps -q --filter "publish=${PORT}")
  if [ -n "${container_ids}" ]; then
    # shellcheck disable=SC2086
    docker stop ${container_ids}
  fi
else
  echo "    (Docker が動いていないので、確認しません)"
fi

echo "==> ポート ${PORT} を使っているプロセスを止めます"
for pid in $(port_pids); do
  name=$(ps -p "${pid}" -o comm= 2>/dev/null || true)
  case "${name}" in
    # Docker 本体は止めない(止めると、Docker Desktop ごと落ちてしまう)
    *[Dd]ocker*)
      echo "    Docker のプロセスは止めません: PID ${pid} (${name})"
      ;;
    *)
      echo "    停止: PID ${pid} (${name})"
      kill "${pid}" 2>/dev/null || true
      ;;
  esac
done

# 停止を待つ(最大 5 秒)。止まらなければ強制的に止める
for _ in $(seq 1 10); do
  [ -z "$(port_pids)" ] && break
  sleep 0.5
done
for pid in $(port_pids); do
  name=$(ps -p "${pid}" -o comm= 2>/dev/null || true)
  case "${name}" in
    *[Dd]ocker*) ;;
    *)
      echo "    強制停止: PID ${pid} (${name})"
      kill -9 "${pid}" 2>/dev/null || true
      ;;
  esac
done
sleep 1

if [ -n "$(port_pids)" ]; then
  echo "エラー: ポート ${PORT} が空きませんでした。次のプロセスが使っています:" >&2
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >&2 || true
  exit 1
fi

# 部品(node_modules)がなければ、先にインストールする(初めて動かすときなど)
if [ ! -d node_modules ]; then
  echo "==> 部品をインストールします(npm ci)"
  npm ci
fi

echo "==> ポート ${PORT} で起動します"
exec npm run dev -- "$@"
