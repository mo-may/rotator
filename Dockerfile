ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts svelte.config.js ./
COPY src ./src
COPY frontend ./frontend
RUN bun run typecheck && bun run build

FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/chooser.sqlite3
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && mkdir -p /data \
    && chown bun:bun /data
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/healthz'); if (!r.ok) process.exit(1)"]
CMD ["bun", "run", "start"]
