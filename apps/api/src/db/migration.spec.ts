import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "..", "drizzle");
const statements = (file: string) =>
  readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

describe("Migration 0004: Tabellen in Schemas verschieben", () => {
  it("behaelt Daten, Fremdschluessel und Kaskaden bei", async () => {
    const pg = new PGlite();
    for (const file of ["0000_init.sql", "0001_social.sql", "0002_moderation_notifications.sql", "0003_events_teams.sql"]) {
      for (const stmt of statements(file)) await pg.exec(stmt);
    }

    // Daten im "alten" Zustand (alles in public)
    await pg.exec(`
      insert into public.users (id, email, password_hash, display_name) values ('00000000-0000-0000-0000-000000000001', 'a@example.de', 'h', 'Anna');
      insert into public.organizations (id, slug, name, category, city) values ('00000000-0000-0000-0000-0000000000a1', 'tsv', 'TSV', 'Sport', 'Stadt');
      insert into public.posts (author_id, org_id, body) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Hallo');
    `);

    for (const stmt of statements("0004_schemas.sql")) await pg.exec(stmt);

    const users = await pg.query<{ display_name: string }>("select display_name from identity.users");
    expect(users.rows).toEqual([{ display_name: "Anna" }]);
    const posts = await pg.query<{ body: string }>("select body from social.posts");
    expect(posts.rows).toEqual([{ body: "Hallo" }]);

    // alte Orte sind leer/weg, Fremdschluessel funktionieren schemaübergreifend weiter
    const left = await pg.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('users','posts','events')");
    expect(left.rows[0].n).toBe(0);
    await pg.exec("delete from identity.users where email = 'a@example.de'");
    const afterDelete = await pg.query<{ n: number }>("select count(*)::int as n from social.posts");
    expect(afterDelete.rows[0].n).toBe(0); // Kaskade identity.users -> social.posts bleibt erhalten
  });
});
