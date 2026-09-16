# ===========================================================================
# wist-center-web — 前端构建 + 静态托管（nginx）
#
# 1. node 构建阶段：npm ci + npm run build → dist/
# 2. nginx 运行阶段：静态托管
#
# 注意：镜像内**不含** nginx 站点配置（与 wist-gateway-web 同构）——SPA 回退与
# `/api` 反代到 wist-center 由运行期挂载的 conf 提供（见 wist-center-stack）。
# 只跑本镜像时，`/` 能出页面，但前端路由深链会 404、`/api` 不通。
# ===========================================================================

# ── 构建阶段 ──
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run build

# ── 运行阶段 ──
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
