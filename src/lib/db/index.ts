import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy-initialized database clients.
// This prevents build failures when DATABASE_URL is not yet configured
// (e.g., first deploy before Neon integration is set up).
let _db: NeonHttpDatabase<typeof schema> | null = null;
let _dbUnpooled: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Please configure a Neon Postgres database in Vercel."
      );
    }
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

/**
 * Get an unpooled database client — bypasses pgbouncer.
 * Use this for large write operations (like ingestion with big embedding vectors)
 * that may exceed the pooler's query size limits.
 */
export function getDbUnpooled(): NeonHttpDatabase<typeof schema> {
  if (!_dbUnpooled) {
    // Prefer the unpooled URL; fall back to the regular one
    const url =
      process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Please configure a Neon Postgres database in Vercel."
      );
    }
    const sql = neon(url);
    _dbUnpooled = drizzle(sql, { schema });
  }
  return _dbUnpooled;
}

/**
 * Convenience export for use in modules that import `db`.
 * Access is proxied through a getter so initialization is deferred.
 * Uses the pooled connection (good for reads and small writes).
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const realDb = getDb();
    const value = (realDb as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(realDb);
    }
    return value;
  },
});
