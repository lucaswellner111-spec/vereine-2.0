import { readFileSync, readdirSync } from "node:fs";
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

describe("Migration 0016: Datenkorrekturen der Haertung", () => {
  it("korrigiert Adressen/Handles, fasst doppelte Meldungen zusammen, bereinigt Vereinsgruppen", async () => {
    const pg = new PGlite();
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files.filter((f) => f < "0016")) for (const stmt of statements(file)) await pg.exec(stmt);

    const u = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const org = "00000000-0000-0000-0000-0000000000a1";
    const conv = "00000000-0000-0000-0000-0000000000c1";
    const empty = "00000000-0000-0000-0000-0000000000c2";
    const msg = "00000000-0000-0000-0000-0000000000e1";
    const post = "00000000-0000-0000-0000-0000000000f1";
    await pg.exec(`
      insert into identity.users (id, email, password_hash, display_name) values
        ('${u(1)}', 'a@example.de', 'h', 'Anna'), ('${u(2)}', 'b@example.de', 'h', 'Ben'), ('${u(3)}', 'c@example.de', 'h', 'Cleo');
      insert into social.profiles (user_id, handle) values ('${u(1)}', 'admin'), ('${u(2)}', 'ben');
      insert into social.organizations (id, slug, name, category, city) values ('${org}', 'mine', 'Mine', 'Sport', 'Stadt');
      insert into social.org_members (org_id, user_id, role, status) values ('${org}', '${u(1)}', 'admin', 'active'), ('${org}', '${u(2)}', 'member', 'active');
      -- Gruppe: Cleo (Besitzerin) ist kein Vereinsmitglied mehr, Ben (aelter) bleibt
      insert into chat.conversations (id, kind, title, org_id, created_by, wrapped_key, key_version) values
        ('${conv}', 'group', 'Team', '${org}', '${u(3)}', 'k', 1), ('${empty}', 'group', 'Leer', '${org}', '${u(3)}', 'k', 1);
      insert into chat.conversation_members (conversation_id, user_id, role, joined_at) values
        ('${conv}', '${u(3)}', 'owner', now() - interval '3 days'), ('${conv}', '${u(2)}', 'member', now() - interval '2 days'),
        ('${conv}', '${u(1)}', 'member', now() - interval '1 day'), ('${empty}', '${u(3)}', 'owner', now());
      insert into chat.messages (id, conversation_id, sender_id, ciphertext) values ('${msg}', '${conv}', '${u(3)}', 'x.y.z');
      insert into chat.message_reports (message_id, conversation_id, reporter_id, reason, snapshot, created_at) values
        ('${msg}', '${conv}', '${u(2)}', 'spam', 's', now() - interval '1 hour'), ('${msg}', '${conv}', '${u(2)}', 'hate', 's', now());
      insert into social.posts (id, author_id, org_id, body) values ('${post}', '${u(1)}', '${org}', 'Hallo');
      insert into social.reports (post_id, org_id, reporter_id, reason, created_at) values
        ('${post}', '${org}', '${u(2)}', 'spam', now() - interval '1 hour'), ('${post}', '${org}', '${u(2)}', 'hate', now());
    `);

    for (const stmt of statements("0016_hardening.sql")) await pg.exec(stmt);

    const slug = (await pg.query<{ slug: string }>("select slug from social.organizations")).rows[0].slug;
    expect(slug).toMatch(/^mine-/);
    const handles = (await pg.query<{ handle: string }>("select handle from social.profiles order by handle")).rows.map((r) => r.handle);
    expect(handles).toContain("ben");
    expect(handles.find((h) => h.startsWith("admin"))).not.toBe("admin");

    const reports = (await pg.query<{ reason: string; sender_id: string }>("select reason, sender_id from chat.message_reports")).rows;
    expect(reports).toEqual([{ reason: "spam", sender_id: u(3) }]); // aelteste bleibt, Absender gesichert
    expect((await pg.query<{ reason: string }>("select reason from social.reports")).rows).toEqual([{ reason: "spam" }]);

    const members = (await pg.query<{ user_id: string; role: string }>(`select user_id, role from chat.conversation_members where conversation_id = '${conv}' order by joined_at`)).rows;
    expect(members).toEqual([{ user_id: u(2), role: "owner" }, { user_id: u(1), role: "member" }]);
    expect((await pg.query("select 1 from chat.conversations where id = $1", [empty])).rows).toHaveLength(0);
    // Meldung bleibt trotz geloeschter Nachricht moeglich (kein Fremdschluessel mehr)
    await pg.exec(`delete from chat.messages where id = '${msg}'`);
    expect((await pg.query("select 1 from chat.message_reports")).rows).toHaveLength(1);
  });
});


describe("Migration 0017: Beitraege bearbeiten, Kommentarmeldungen, Vereinsbilder", () => {
  it("ersetzt den Melde-Index, behaelt Bestand und erzwingt Besitzer oder Verein bei Medien", async () => {
    const pg = new PGlite();
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files.filter((f) => f < "0017")) for (const stmt of statements(file)) await pg.exec(stmt);

    const u = "00000000-0000-0000-0000-000000000001";
    const org = "00000000-0000-0000-0000-0000000000a1";
    const post = "00000000-0000-0000-0000-0000000000f1";
    const comment = "00000000-0000-0000-0000-0000000000f2";
    await pg.exec(`
      insert into identity.users (id, email, password_hash, display_name) values ('${u}', 'a@example.de', 'h', 'Anna');
      insert into social.organizations (id, slug, name, category, city) values ('${org}', 'tsv', 'TSV', 'Sport', 'Stadt');
      insert into social.posts (id, author_id, org_id, body) values ('${post}', '${u}', '${org}', 'Hallo');
      insert into social.comments (id, post_id, author_id, body) values ('${comment}', '${post}', '${u}', 'Kommentar');
      insert into social.reports (post_id, reporter_id, reason, org_id) values ('${post}', '${u}', 'spam', '${org}');
      insert into social.media (owner_id, kind, width, height, bytes) values ('${u}', 'avatar', 1, 1, 1);
    `);

    for (const stmt of statements("0017_p4a_posts_orgs.sql")) await pg.exec(stmt);

    // Bestand bleibt
    expect((await pg.query<{ n: number }>("select count(*)::int as n from social.reports")).rows[0].n).toBe(1);
    expect((await pg.query<{ e: string | null }>("select edited_at as e from social.posts")).rows[0].e).toBeNull();
    // Beitragsmeldung weiter nur einmal offen, Kommentarmeldung derselben Person daneben moeglich und auch nur einmal
    await expect(pg.exec(`insert into social.reports (post_id, reporter_id, reason) values ('${post}', '${u}', 'spam')`)).rejects.toThrow();
    await pg.exec(`insert into social.reports (post_id, comment_id, reporter_id, reason) values ('${post}', '${comment}', '${u}', 'spam')`);
    await expect(pg.exec(`insert into social.reports (post_id, comment_id, reporter_id, reason) values ('${post}', '${comment}', '${u}', 'hate')`)).rejects.toThrow();
    const idx = await pg.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'reports_open_once_uq'");
    expect(idx.rows[0].indexdef).toMatch(/comment_id IS NULL/);
    // Kaskade: Kommentar weg -> seine Meldung weg
    await pg.exec(`delete from social.comments where id = '${comment}'`);
    expect((await pg.query<{ n: number }>("select count(*)::int as n from social.reports")).rows[0].n).toBe(1);

    // Medien: ohne Besitzer nur mit Verein (CHECK); Vereinsbild ueberlebt den Nutzer, Logo-Verweis wird bei Loeschung NULL
    await expect(pg.exec(`insert into social.media (kind, width, height, bytes) values ('org_logo', 1, 1, 1)`)).rejects.toThrow();
    const logo = "00000000-0000-0000-0000-0000000000b1";
    await pg.exec(`insert into social.media (id, org_id, kind, width, height, bytes) values ('${logo}', '${org}', 'org_logo', 1, 1, 1)`);
    await pg.exec(`update social.organizations set logo_media_id = '${logo}' where id = '${org}'`);
    await pg.exec(`delete from social.media where id = '${logo}'`);
    expect((await pg.query<{ l: string | null }>("select logo_media_id as l from social.organizations")).rows[0].l).toBeNull();
  });
});
