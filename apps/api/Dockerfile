# syntax=docker/dockerfile:1
# Build context: repository root (docker compose: context ".", dockerfile apps/api/Dockerfile).

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN apk add --no-cache openssl && npm install -g pnpm@12.14.0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @vippi/api... --filter @vippi/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vippi/shared run build \
 && pnpm --filter @vippi/api run build \
 && pnpm --filter @vippi/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/prisma /out/ \
 && cd /out && npx --no-install prisma generate --schema prisma/schema.prisma

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
COPY --chown=node:node apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "sh", "/app/docker-entrypoint.sh"]
