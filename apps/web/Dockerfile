# syntax=docker/dockerfile:1
# Build context: repository root (docker compose: context ".", dockerfile apps/web/Dockerfile).

FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@12.14.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @vippi/web... --filter @vippi/shared
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @vippi/shared run build && pnpm --filter @vippi/web exec vite build

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
