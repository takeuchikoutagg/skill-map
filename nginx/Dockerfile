# 本番の、受付(リバースプロキシ)のイメージ。設定ファイル(nginx.conf)を、そのまま焼き込む
# (本番では、あとから設定ファイルを差し替えない。変えたいときは、nginx.conf を直して、作り直す)。
#   docker build -t skill-map-nginx .

ARG NGINX_VERSION=1.27-alpine
FROM nginx:${NGINX_VERSION}

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
