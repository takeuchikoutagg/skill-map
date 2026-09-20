#!/usr/bin/env bash
# バックエンド(Rails API + MySQL)を、ポート 3001 で起動する。
#
# ポートが使われていても、別のポートに逃がして起動しない。
# 使っているものを止めてから、同じ 3001 番で起動する(CLAUDE.md のルール)。
#
# 使い方: cd backend && ./start.sh
#   追加の引数は docker compose up に渡す(例: ./start.sh -d でバックグラウンド起動)

set -euo pipefail

PORT=3001
cd "$(dirname "$0")/.."   # docker-compose.yml があるリポジトリ直下へ

port_pids() {
  lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

echo "==> このプロジェクトのコンテナを止めます"
docker compose down

echo "==> ポート ${PORT} を使っている、ほかの Docker コンテナを止めます"
container_ids=$(docker ps -q --filter "publish=${PORT}")
if [ -n "${container_ids}" ]; then
  # shellcheck disable=SC2086
  docker stop ${container_ids}
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

echo "==> ポート ${PORT} で起動します"
docker compose up --build "$@"
