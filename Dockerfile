# "web" service — Next.js admin UI + player + API (PRD §11.2)
FROM node:22-slim AS base
# ffmpeg: provides ffprobe for video duration probing (PRD §11.2)
# python3/make/g++: required to build better-sqlite3's native addon
RUN apt-get update -y && apt-get install -y ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*
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
# next.config.ts sets output: "standalone" — this bundle already includes
# a minimal node_modules, so we don't copy the full deps layer.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
# node_modules/.bin isn't in the standalone output — bring drizzle-kit
# along so `drizzle-kit migrate` can run at container start. better-sqlite3's
# native build output also isn't traced by the standalone bundler.
COPY --from=builder /app/node_modules/.bin/drizzle-kit ./node_modules/.bin/drizzle-kit
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node server.js"]
