# syntax=docker/dockerfile:1
# Single-origin image for Render (ADR-022): one Node process serves the API under /api and the built SPA.
# Build context: repository root. Local: docker build -t vippi-app . (docker compose keeps separate api/web images).

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN apk add --no-cache openssl && npm install -g pnpm@12.14.0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @vippi/api... --filter @vippi/web... --filter @vippi/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @vippi/shared run build \
 && pnpm --filter @vippi/web exec vite build \
 && pnpm --filter @vippi/api run build \
 && pnpm --filter @vippi/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/prisma /out/ \
 && cp -r apps/web/dist /out/web \
 && cd /out && npx --no-install prisma generate --schema prisma/schema.prisma

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl tini
# Free Render instances have 512 MB RAM; keep the V8 heap well below it (Prisma's engine and buffers live outside).
ENV NODE_ENV=production WEB_DIST_DIR=/app/web NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
COPY --from=build --chown=node:node /out /app
COPY --chown=node:node apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
USER node
EXPOSE 10000
ENV PORT=10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--", "sh", "/app/docker-entrypoint.sh"]
