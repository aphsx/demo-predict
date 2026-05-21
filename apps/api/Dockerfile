FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3002
CMD ["bun", "run", "src/index.ts"]
