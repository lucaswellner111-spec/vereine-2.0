import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../db/schema";

/**
 * Test-Datenbank fuer API-Specs (nur Tests, nicht im Build).
 * - Standard: In-Memory-PGlite (schnell, ohne Docker).
 * - Mit TEST_DATABASE_URL (z. B. postgres://postgres:postgres@localhost:5432/postgres): echtes Postgres ueber
 *   postgres-js, je Aufruf eine frische Datenbank `vt_…` mit allen Migrationen. So fallen Treiber-Unterschiede
 *   (z. B. JS-Date in freiem sql-Ausdruck) schon in den Tests auf. Aufraeumen: vitest.global-setup.ts.
 * Der Typ bleibt der PGlite-Typ, damit die Specs unveraendert bleiben; beide Treiber erfuellen dieselbe Drizzle-API.
 */
export type TestDb = ReturnType<typeof drizzlePglite<typeof schema>>;

export const TEST_DB_PREFIX = "vt_";
const migrationsFolder = join(__dirname, "..", "..", "drizzle");

export const usesRealPostgres = () => Boolean(process.env.TEST_DATABASE_URL);

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = drizzlePglite(new PGlite(), { schema });
    await migratePglite(db, { migrationsFolder });
    return db;
  }
  const name = `${TEST_DB_PREFIX}${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const admin = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const target = new URL(url);
  target.pathname = `/${name}`;
  const client = postgres(target.toString(), { max: 4, onnotice: () => undefined });
  const db = drizzlePg(client, { schema });
  await migratePg(db, { migrationsFolder });
  return db as unknown as TestDb;
}

/** Entfernt alle Test-Datenbanken (auch Reste abgebrochener Laeufe). */
export async function dropTestDatabases(url: string): Promise<number> {
  const admin = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const rows = await admin<{ datname: string }[]>`select datname from pg_database where datname like ${TEST_DB_PREFIX + "%"}`;
    for (const { datname } of rows) await admin.unsafe(`drop database if exists "${datname}" with (force)`);
    return rows.length;
  } finally {
    await admin.end();
  }
}
