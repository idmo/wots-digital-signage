import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

// Dev-mode singleton so hot-reload doesn't reopen the SQLite file
// repeatedly. The worker service (worker/index.ts) has its own copy
// of this pattern since it's a separate process.
const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
};

const DATABASE_PATH = (process.env.DATABASE_URL ?? "file:./signage.db").replace(/^file:/, "");

// path.join with a runtime-computed segment makes Next's build tracer treat
// the whole project as a filesystem dependency (it can't statically narrow
// the result) — turbopackIgnore tells it this resolution isn't part of the
// route's static asset graph (per Next's own warning message for this case).
const resolvedPath = path.isAbsolute(DATABASE_PATH)
  ? DATABASE_PATH
  : path.join(/* turbopackIgnore: true */ process.cwd(), DATABASE_PATH);

const sqlite = globalForDb.sqlite ?? new Database(resolvedPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export * as schema from "./schema";
