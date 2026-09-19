# "web" service — Next.js admin UI + player + API (PRD §11.2)
FROM node:22-slim AS base
# ffmpeg: provides ffprobe for video duration probing (PRD §11.2)
RUN apt-get update -y && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
# Full node_modules first (so drizzle-kit + pg are present for the migrate
# step below — Next's standalone tracer doesn't know about those since
# they're only used by the migration command, not the app server itself),
# then the standalone bundle overlays its own trimmed server + node_modules
# on top for the actual `node server.js` runtime.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node server.js"]
