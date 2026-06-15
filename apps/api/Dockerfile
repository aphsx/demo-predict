FROM oven/bun:1-alpine

WORKDIR /app

# Workspace install (layer cache)
COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN bun install --frozen-lockfile

COPY packages/types ./packages/types
COPY apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
