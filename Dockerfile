# syntax=docker/dockerfile:1.6
# 圈见 · 多阶段构建：deps → builder → runner（standalone 输出，非 root 运行）

# ---------- 1. 安装依赖 ----------
FROM node:26-alpine AS deps
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 2. 构建 ----------
FROM node:26-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 浏览器端 AK 会在 build 时内联进前端产物，通过 --build-arg 传入；服务端 AK 只在运行时注入
ARG NEXT_PUBLIC_BAIDU_BROWSER_AK=""
ENV NEXT_PUBLIC_BAIDU_BROWSER_AK=$NEXT_PUBLIC_BAIDU_BROWSER_AK \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- 3. 运行 ----------
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3010 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/data/cache && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/data/samples ./data/samples
USER nextjs
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3010/api/health || exit 1
CMD ["node", "server.js"]
