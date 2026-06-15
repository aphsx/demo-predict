FROM oven/bun:1-alpine

WORKDIR /app

# Workspace install (layer cache)
COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN bun install --frozen-lockfile

COPY packages/types ./packages/types
COPY apps/web ./apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["bun", "run", "dev"]
