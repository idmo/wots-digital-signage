# Digital Signage for the Shop

Self-hosted digital signage for Word on the Street Books — Next.js (App Router) + Tailwind CSS + Drizzle ORM, per the [Product & Technical Requirements Document](./docs) (also on Google Drive / the project's Google Doc).

This is the **Phase 1 (MVP)** slice: static image + video blocks, categories, scheduling, a single drag-and-drop sequence, the `/player` route, basic WordPress Events sync, and the plumbing (worker service, Docker Compose) the later phases build on. Dynamic/templated blocks (Community Board, Featured Readers) and full import/export are Phase 2+.

## Stack

- **Next.js 16 (App Router, TypeScript)** — admin UI, player rendering, and API (Route Handlers) in one app.
- **Tailwind CSS 4**
- **Drizzle ORM** — `node-postgres` driver, against a **PostgreSQL** database (run via Docker, in dev and in production).
- **dnd-kit** — sequence builder drag-and-drop.
- **A separate `worker` process** (Node/TypeScript + `node-cron`) for scheduled polling — see [Architecture](#architecture).

> **Note:** this was originally scaffolded with Prisma, then Drizzle+SQLite, before landing on Drizzle+Postgres. `better-sqlite3` (a native module) turned out to crash the whole Node process on some machines when its compiled binding didn't match the local Node/CPU architecture — a native-module footgun, not a bug in the app code. Postgres has no such problem: `pg` is pure JS, and running it via Docker means the database itself doesn't depend on what's installed on your machine at all.

## Local Development

Postgres runs in Docker even in dev — only `web`/`worker` (via `npm run dev` / `npm run worker`) run directly on your machine.

```bash
docker compose -f docker-compose.dev.yml up -d   # starts just Postgres, on localhost:5432
npm install
cp .env.example .env   # defaults already point at the docker-compose.dev.yml Postgres
npm run db:migrate     # applies drizzle/*.sql
npm run db:seed        # seeds the 5 default categories (PRD §3.5)
npm run dev
```

To change the schema later: edit `db/schema.ts`, run `npm run db:generate` to produce a new SQL migration under `drizzle/`, then `npm run db:migrate` to apply it. `npm run db:studio` opens Drizzle Studio to browse the DB.

- Admin UI: http://localhost:3000/admin
- Player: http://localhost:3000/player

To also run the polling worker locally (optional in dev — the admin UI's manual actions don't need it):

```bash
npm run worker
```

## Architecture

```
Next.js app ("web")                    Worker process ("worker")
  /admin/*  — content & sequence mgmt    node-cron:
  /player   — full-screen render route     - polls Data Sources (§6.8)
  /api/*    — Route Handlers, incl.         - sweeps expired blocks (§4)
              the n8n webhook receiver     (shares the same Drizzle client/DB)
  Drizzle ORM
       |
       v
  PostgreSQL ("db" service in Docker)
  /public/uploads — cached & uploaded assets
```

Both `web` and `worker` connect to the same Postgres database over the network (the `db` service in Docker Compose) and share one assets folder (the `signage-assets` named volume). The kiosk browser (Chromium in kiosk mode, pointed at `/player`) runs natively on the host Mac, outside Docker — it needs direct display/AirPlay access.

Full rationale for the Next.js + worker split, the data model, WordPress/Pods integration, and the n8n real-time-sync design are in the PRD.

## Hosting on a Separate Mac

Development happens here; the containers run on a different physical Mac (the one with the AirPlay TV). Three ways to get the build there — the PRD (§11.5) has full detail on trade-offs; the short version:

**Option A — git clone + build on the host Mac (recommended to start):**
```bash
# on the host Mac
git clone <your-repo-url> signage-app && cd signage-app
cp .env.example .env   # fill in real values — never commit .env
docker compose build && docker compose up -d
```
To ship an update later: `git pull && docker compose up -d --build`.

**Option B — build here, push to a registry, pull on the host Mac** (once updates get frequent):
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/<you>/signage-web:latest --push .
docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile.worker -t ghcr.io/<you>/signage-worker:latest --push .
# then on the host Mac, with docker-compose.yml's build: sections swapped for image: tags
docker login ghcr.io && docker compose pull && docker compose up -d
```

**Option C — direct image transfer** (no registry, no git on the host Mac; requires matching CPU architecture unless built multi-arch as in B):
```bash
docker compose build
docker save signage-app-web signage-app-worker | gzip > signage-images.tar.gz
# transfer via AirDrop/USB/network share, then on the host Mac:
docker load < signage-images.tar.gz && docker compose up -d
```

**First-time checklist on the host Mac (any option):**
1. Install Docker Desktop (or Colima/OrbStack).
2. Get the compose project onto the machine (A, B, or C above).
3. Copy a real `.env` over, including a real `POSTGRES_PASSWORD` (never commit it).
4. `docker compose up -d`, confirm `http://localhost:3000/admin` loads. (`db` starts first and `web`/`worker` wait for its healthcheck before starting.)
5. Point the kiosk browser's launchd agent at `http://localhost:3000/player`.
6. Add a `launchd` entry to run `docker compose up -d` on boot.
7. The `web` container runs `drizzle-kit migrate` automatically on startup; run `docker compose exec web npm run db:seed` once if the DB is fresh.

## Project Layout

```
app/
  admin/            Admin UI (dashboard, block library, sequence builder)
  player/           Full-screen kiosk render route
  api/               Route Handlers (blocks, sequences, categories, assets,
                     data-sources + sync, n8n webhook, player status)
lib/
  scheduling.ts     Block eligibility / status logic (PRD §4)
  resolve.ts        Sequence -> ordered play-list resolution (PRD §5)
  wordpress.ts      WordPress REST integration (PRD §6)
db/
  index.ts          Drizzle client singleton (node-postgres)
  schema.ts         Data model + relations (PRD §10)
  seed.ts           Seeds default categories
drizzle/
  *.sql             Generated migrations (via `npm run db:generate`)
worker/
  index.ts          Standalone polling/cron process (PRD §11.1)
Dockerfile               "web" service image
Dockerfile.worker        "worker" service image
docker-compose.yml       Full stack: db + web + worker (production)
docker-compose.dev.yml   Just Postgres, port-exposed (local dev)
```

## What's Not Built Yet (Phase 2+)

- Community Board and Featured Readers Pods content types + the recommended custom `signage/v1` REST endpoint (PRD §6.2–§6.4)
- Template engine for dynamic/templated blocks and their rendering on `/player` (PRD §3.6)
- Multiple sequences live-switching, full-system Import/Export (PRD §13)
- n8n webhook workflow on the WordPress side (the receiving API route exists at `/api/webhooks/n8n`, per §6.8)
