# フロントエンド(Next.js)の、本番用のイメージ。開発では使わない(開発は frontend/start.sh、パソコンの Node.js)。
#   docker build --build-arg NEXT_PUBLIC_API_URL= -t skill-map-frontend .
#
# NEXT_PUBLIC_API_URL は、ビルドのときに、画面のプログラムに埋め込まれる(あとから、環境変数を変えても効かない)。
# 本番(Nginx が同じオリジンで振り分ける構成)では、空にしてビルドする(docs/06-技術スタック.md、docs/07-デプロイガイド.md)。

ARG NODE_VERSION=24-slim

# ---------- 依存関係のインストール(ビルドと実行の、両方で使う node_modules) ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- ビルド ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# next.config.ts の output: "standalone" で、実行に必要なファイルだけを、.next/standalone にまとめる
RUN npm run build

# ---------- 実行(ビルドの結果と、必要なものだけを持つ、小さいイメージ) ----------
FROM node:${NODE_VERSION} AS run
WORKDIR /app
ENV NODE_ENV=production

# 非 root ユーザーで動かす(Next.js の本番イメージの、標準的な作り方)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# standalone の出力(サーバーの本体と、必要な node_modules だけ)
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# 静的ファイル(CSS、ビルドの JS など)は、standalone の出力に含まれないので、別にコピーする。
# public/ は、このプロジェクトにはない(favicon は app/ の中にあり、standalone の出力に含まれる)
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
