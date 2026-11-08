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

describe("Migration 0018: Termine mit Limit, Warteliste, Helferlisten, Anwesenheit", () => {
  it("traegt yes_count nach und haelt Zaehler per Trigger (auch bei Kaskaden)", async () => {
    const pg = new PGlite();
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files.filter((f) => f < "0018")) for (const stmt of statements(file)) await pg.exec(stmt);

    const u = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const org = "00000000-0000-0000-0000-0000000000a1";
    const ev = "00000000-0000-0000-0000-0000000000e1";
    await pg.exec(`
      insert into identity.users (id, email, password_hash, display_name) values
        ('${u(1)}', 'a@example.de', 'h', 'Anna'), ('${u(2)}', 'b@example.de', 'h', 'Ben'), ('${u(3)}', 'c@example.de', 'h', 'Cleo');
      insert into social.organizations (id, slug, name, category, city) values ('${org}', 'tsv', 'TSV', 'Sport', 'Stadt');
      insert into social.events (id, org_id, title, starts_at) values ('${ev}', '${org}', 'Training', now() + interval '1 day');
      insert into social.event_rsvps (event_id, user_id, status) values ('${ev}', '${u(1)}', 'yes'), ('${ev}', '${u(2)}', 'yes'), ('${ev}', '${u(3)}', 'maybe');
    `);

    for (const stmt of statements("0018_p4b_events.sql")) await pg.exec(stmt);

    const count = async () => (await pg.query<{ n: number; kind: string }>(`select yes_count as n, kind from social.events where id = '${ev}'`)).rows[0];
    expect(await count()).toEqual({ n: 2, kind: "other" }); // Backfill, Standard-Art
    await pg.exec(`update social.event_rsvps set status = 'yes' where user_id = '${u(3)}'`);
    expect((await count()).n).toBe(3);
    await pg.exec(`update social.event_rsvps set status = 'yes', updated_at = now() where user_id = '${u(3)}'`); // gleicher Status: kein Doppelzaehlen
    expect((await count()).n).toBe(3);
    await pg.exec(`update social.event_rsvps set status = 'no' where user_id = '${u(2)}'`);
    expect((await count()).n).toBe(2);
    await pg.exec(`delete from identity.users where id = '${u(1)}'`); // Kaskade Kontoloeschung
    expect((await count()).n).toBe(1);

    // Limit: Zusage ueber das Limit scheitert am CHECK (23514), Limit unter Zusagen ebenso
    await pg.exec(`update social.events set capacity = 1 where id = '${ev}'`);
    await expect(pg.exec(`update social.event_rsvps set status = 'yes' where user_id = '${u(2)}'`)).rejects.toMatchObject({ code: "23514" });
    expect((await count()).n).toBe(1);
    await expect(pg.exec(`update social.events set capacity = 0 where id = '${ev}'`)).rejects.toThrow();
    await expect(pg.exec(`update social.events set kind = 'grillen' where id = '${ev}'`)).rejects.toThrow();

    // Helferplaetze: Trigger zaehlt, CHECK verhindert Ueberbuchung, Kaskade senkt
    const shift = "00000000-0000-0000-0000-0000000000d1";
    await pg.exec(`insert into social.event_shifts (id, event_id, title, slots) values ('${shift}', '${ev}', 'Kuchen', 1)`);
    await pg.exec(`insert into social.event_shift_signups (shift_id, user_id) values ('${shift}', '${u(2)}')`);
    await expect(pg.exec(`insert into social.event_shift_signups (shift_id, user_id) values ('${shift}', '${u(3)}')`)).rejects.toMatchObject({ code: "23514" });
    const taken = async () => (await pg.query<{ t: number }>(`select taken as t from social.event_shifts`)).rows[0].t;
    expect(await taken()).toBe(1);
    await pg.exec(`delete from identity.users where id = '${u(2)}'`);
    expect(await taken()).toBe(0);

    // Anwesenheit: nur bekannte Werte; Termin loeschen raeumt alles ab (Trigger auf geloeschtem Termin stoert nicht)
    await expect(pg.exec(`insert into social.event_attendance (event_id, user_id, status) values ('${ev}', '${u(3)}', 'krank')`)).rejects.toThrow();
    await pg.exec(`insert into social.event_attendance (event_id, user_id, status) values ('${ev}', '${u(3)}', 'present')`);
    await pg.exec(`delete from social.events where id = '${ev}'`);
    const left = await pg.query<{ n: number }>("select (select count(*) from social.event_rsvps) + (select count(*) from social.event_shifts) + (select count(*) from social.event_attendance) as n");
    expect(Number(left.rows[0].n)).toBe(0);
  });
});

describe("Migration 0019: Umfragen und oeffentliche Vereinsseite", () => {
  it("Funktionen stehen je in einem eigenen Block (kein breakpoint im Rumpf)", () => {
    const fns = statements("0019_p4c_polls_public.sql").filter((s) => /CREATE OR REPLACE FUNCTION/.test(s));
    expect(fns).toHaveLength(1);
    for (const fn of fns) {
      expect(fn.match(/\$\$/g)).toHaveLength(2);
      expect(fn.trim().endsWith("$$;")).toBe(true);
      expect(fn).toMatch(/END;\s*\$\$;$/);
    }
  });

  it("Bestand bleibt privat, Trigger zaehlt Stimmen (auch bei Wechsel und Kaskaden), Option muss zur Umfrage gehoeren", async () => {
    const pg = new PGlite();
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files.filter((f) => f < "0019")) for (const stmt of statements(file)) await pg.exec(stmt);

    const u = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const org = "00000000-0000-0000-0000-0000000000a1";
    const post = "00000000-0000-0000-0000-0000000000f1";
    const post2 = "00000000-0000-0000-0000-0000000000f2";
    await pg.exec(`
      insert into identity.users (id, email, password_hash, display_name) values
        ('${u(1)}', 'a@example.de', 'h', 'Anna'), ('${u(2)}', 'b@example.de', 'h', 'Ben'), ('${u(3)}', 'c@example.de', 'h', 'Cleo');
      insert into social.organizations (id, slug, name, category, city) values ('${org}', 'tsv', 'TSV', 'Sport', 'Stadt');
      insert into social.posts (id, author_id, org_id, body) values ('${post}', '${u(1)}', '${org}', 'Frage'), ('${post2}', '${u(1)}', '${org}', 'Andere');
    `);

    for (const stmt of statements("0019_p4c_polls_public.sql")) await pg.exec(stmt);

    expect((await pg.query<{ p: boolean }>("select public_page as p from social.organizations")).rows[0].p).toBe(false);
    const o = (n: number) => `00000000-0000-0000-0000-0000000000b${n}`;
    await pg.exec(`
      insert into social.polls (post_id, question) values ('${post}', 'Welcher Tag?'), ('${post2}', 'Andere Frage');
      insert into social.poll_options (id, post_id, position, label) values ('${o(1)}', '${post}', 0, 'Sa'), ('${o(2)}', '${post}', 1, 'So'), ('${o(3)}', '${post2}', 0, 'X');
      insert into social.poll_votes (post_id, option_id, user_id) values ('${post}', '${o(1)}', '${u(1)}'), ('${post}', '${o(1)}', '${u(2)}'), ('${post}', '${o(2)}', '${u(3)}');
    `);
    const votes = async () => (await pg.query<{ v: number }>(`select votes as v from social.poll_options where post_id = '${post}' order by position`)).rows.map((r) => r.v);
    expect(await votes()).toEqual([2, 1]);
    await pg.exec(`update social.poll_votes set option_id = '${o(2)}' where user_id = '${u(2)}'`);
    expect(await votes()).toEqual([1, 2]);
    await pg.exec(`update social.poll_votes set created_at = now() where user_id = '${u(2)}'`); // gleiche Option: kein Doppelzaehlen
    expect(await votes()).toEqual([1, 2]);
    // zweite Stimme derselben Person (PK) und fremde Option (zusammengesetzter FK) scheitern
    await expect(pg.exec(`insert into social.poll_votes (post_id, option_id, user_id) values ('${post}', '${o(2)}', '${u(1)}')`)).rejects.toThrow();
    await expect(pg.exec(`insert into social.poll_votes (post_id, option_id, user_id) values ('${post2}', '${o(1)}', '${u(1)}')`)).rejects.toThrow();
    await expect(pg.exec(`update social.poll_options set votes = -1 where id = '${o(3)}'`)).rejects.toMatchObject({ code: "23514" });
    await expect(pg.exec(`insert into social.polls (post_id, question) values ('${u(1)}', 'x')`)).rejects.toThrow();
    // Kontoloeschung senkt, Stimme zuruecknehmen senkt
    await pg.exec(`delete from identity.users where id = '${u(3)}'`);
    expect(await votes()).toEqual([1, 1]);
    await pg.exec(`delete from social.poll_votes where user_id = '${u(1)}'`);
    expect(await votes()).toEqual([0, 1]);
    // Beitrag weg -> Umfrage, Optionen und Stimmen weg (Trigger auf geloeschten Optionen stoert nicht)
    await pg.exec(`delete from social.posts where id = '${post}'`);
    const left = await pg.query<{ n: number }>(`select (select count(*) from social.polls where post_id = '${post}') + (select count(*) from social.poll_options where post_id = '${post}') + (select count(*) from social.poll_votes where post_id = '${post}') as n`);
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
