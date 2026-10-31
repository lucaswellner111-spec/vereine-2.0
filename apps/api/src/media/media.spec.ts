import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MediaService } from "./media.service";
import { StorageService } from "./storage.service";

const password = "ein-sehr-langes-passwort";

function multipart(filename: string, data: Buffer, type: string) {
  const boundary = "----testboundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
const png = (w = 800, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: "#3a7d44" } }).png().toBuffer();
const jpegWithExif = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: "#aa5522" } })
    .withExif({ IFD0: { Copyright: "GEHEIM-GPS-MARKER", Artist: "Max Mustermann" } })
    .jpeg()
    .toBuffer();

describe("Medien: Upload, Verarbeitung, Auslieferung", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let storage: StorageService;
  let media: MediaService;
  const dir = mkdtempSync(join(tmpdir(), "vereine-media-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    storage = app.get(StorageService);
    media = app.get(MediaService);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
  });

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const upload = (u: U, url: string, filename: string, data: Buffer, type = "image/png") => {
    const m = multipart(filename, data, type);
    return app.inject({ method: "POST", url, payload: m.payload, headers: { ...m.headers, cookie: u.cookie } });
  };

  let anna: U, ben: U, clara: U;

  beforeAll(async () => {
    [anna, ben, clara] = [await signup("anna"), await signup("ben"), await signup("clara")];
  });

  it("Avatar: wird zugeschnitten (256/64 px), als WebP gespeichert und im Profil verknuepft", async () => {
    const res = await upload(anna, "/media/avatar", "ich.png", await png(900, 400));
    expect(res.statusCode).toBe(201);
    const ref = res.json();
    expect(ref).toMatchObject({ width: 256, height: 256 });
    expect((await req(ben, "GET", "/profiles/me")).json().avatarId).toBeNull();
    expect((await req(anna, "GET", "/profiles/me")).json().avatarId).toBe(ref.id);

    const big = await req(ben, "GET", `/media/${ref.id}/avatar`); // Avatare sind fuer angemeldete Nutzer sichtbar
    expect(big.statusCode).toBe(200);
    expect(big.headers["content-type"]).toBe("image/webp");
    expect(big.headers["cache-control"]).toMatch(/private/);
    expect(big.headers["x-content-type-options"]).toBe("nosniff");
    const meta = await sharp(big.rawPayload).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect((await sharp((await req(ben, "GET", `/media/${ref.id}/avatar-sm`)).rawPayload).metadata()).width).toBe(64);
    expect((await app.inject({ method: "GET", url: `/media/${ref.id}/avatar` })).statusCode).toBe(401);
    expect((await req(ben, "GET", `/media/${ref.id}/medium`)).statusCode).toBe(404); // Variante gehoert nicht zu Avataren
  });

  it("Avatar ersetzen loescht die alte Datei; entfernen loescht Datei und Verknuepfung", async () => {
    const first = (await req(anna, "GET", "/profiles/me")).json().avatarId;
    const second = (await upload(anna, "/media/avatar", "neu.png", await png(300, 300))).json();
    expect(second.id).not.toBe(first);
    expect(await storage.get(`${first}/avatar.webp`)).toBeNull();
    expect(await db.select().from(schema.media).where(eq(schema.media.id, first))).toHaveLength(0);
    expect(await storage.get(`${second.id}/avatar.webp`)).not.toBeNull();

    expect((await req(anna, "DELETE", "/media/avatar")).statusCode).toBe(204);
    expect(await storage.get(`${second.id}/avatar.webp`)).toBeNull();
    expect((await req(anna, "GET", "/profiles/me")).json().avatarId).toBeNull();
  });

  it("EXIF/Metadaten werden entfernt, das Original wird nicht gespeichert", async () => {
    const original = await jpegWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined(); // Testbild enthaelt EXIF
    const ref = (await upload(anna, "/media/post", "foto.jpg", original, "image/jpeg")).json();
    for (const v of ["thumb", "medium"]) {
      const stored = (await storage.get(`${ref.id}/${v}.webp`))!;
      expect(stored.includes(Buffer.from("GEHEIM-GPS-MARKER"))).toBe(false);
      expect(stored.includes(Buffer.from("Max Mustermann"))).toBe(false);
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
    }
    expect(await storage.get(`${ref.id}/original`)).toBeNull();
    expect(ref).toMatchObject({ width: 640, height: 480 });
  });

  it("Ablehnung: kein Bild, falscher Typ, SVG, zu gross, kaputt, nur multipart", async () => {
    expect((await upload(anna, "/media/post", "x.txt", Buffer.from("das ist kein bild"), "text/plain")).statusCode).toBe(400);
    expect((await upload(anna, "/media/post", "x.png", Buffer.from("PNG-Endung, aber Text"), "image/png")).statusCode).toBe(400); // Typ am Inhalt erkannt
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    expect((await upload(anna, "/media/post", "x.svg", svg, "image/svg+xml")).statusCode).toBe(400);
    expect((await upload(anna, "/media/post", "riesig.png", await png(13000, 10))).statusCode).toBe(400); // zu viele Pixel je Seite
    const huge = Buffer.alloc(9 * 1024 * 1024, 1);
    expect([400, 413]).toContain((await upload(anna, "/media/post", "gross.png", huge)).statusCode);
    expect((await req(anna, "POST", "/media/post", { foo: "bar" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/media/post" })).statusCode).toBe(401);
    expect(await db.select().from(schema.media).where(eq(schema.media.kind, "post"))).toHaveLength(1); // nur das gueltige Foto von oben
  });

  let postWithImages: { id: string; media: { id: string }[] };
  let draftId: string;

  it("Beitrag mit Bildern: nur eigene, nur unbenutzte, maximal 4; Text darf fehlen", async () => {
    const a = (await upload(anna, "/media/post", "1.png", await png(1600, 1200))).json();
    const b = (await upload(anna, "/media/post", "2.png", await png(500, 900))).json();
    expect(a.width).toBe(1080); // auf 1080 begrenzt
    const foreign = (await upload(ben, "/media/post", "f.png", await png())).json();

    expect((await req(anna, "POST", "/posts", { body: "x", mediaIds: [foreign.id] })).statusCode).toBe(400); // fremdes Bild
    expect((await req(anna, "POST", "/posts", { body: "x", mediaIds: ["00000000-0000-0000-0000-000000000000"] })).statusCode).toBe(400);
    expect((await req(anna, "POST", "/posts", { body: "" })).statusCode).toBe(400); // weder Text noch Bild
    expect((await req(anna, "POST", "/posts", { mediaIds: Array(5).fill(a.id) })).statusCode).toBe(400); // max. 4

    const res = await req(anna, "POST", "/posts", { body: "", mediaIds: [a.id, b.id] }); // nur Bilder
    expect(res.statusCode).toBe(201);
    postWithImages = res.json();
    expect(postWithImages.media.map((m) => m.id)).toEqual([a.id, b.id]); // Reihenfolge bleibt
    expect((await req(anna, "POST", "/posts", { body: "nochmal", mediaIds: [a.id] })).statusCode).toBe(400); // schon verwendet
    // fehlgeschlagener Beitrag hinterlaesst keinen halben Beitrag
    expect(await db.select().from(schema.posts)).toHaveLength(1);

    draftId = foreign.id; // hochgeladen, aber nie angehaengt (Entwurf)
  });

  it("Auslieferung: Entwuerfe nur fuer den Besitzer, Beitragsbilder je nach Sichtbarkeit", async () => {
    const mediaId = postWithImages.media[0].id;
    // persoenlicher Beitrag eines OEFFENTLICHEN Profils: fuer alle angemeldeten Nutzer sichtbar
    expect((await req(ben, "GET", `/media/${mediaId}/medium`)).statusCode).toBe(200);
    expect((await req(ben, "GET", `/media/${mediaId}/thumb`)).statusCode).toBe(200);
    expect((await req(ben, "GET", `/media/${mediaId}/avatar`)).statusCode).toBe(404);

    // Entwurf: nur der Besitzer
    expect((await req(ben, "GET", `/media/${draftId}/medium`)).statusCode).toBe(200); // Besitzer (ben)
    expect((await req(clara, "GET", `/media/${draftId}/medium`)).statusCode).toBe(404);

    // privates Profil: Nicht-Follower bekommen 403
    await req(anna, "PUT", "/profiles/me", { visibility: "private" });
    expect((await req(clara, "GET", `/media/${mediaId}/medium`)).statusCode).toBe(403);
    expect((await req(anna, "GET", `/media/${mediaId}/medium`)).statusCode).toBe(200);
    const handle = (await req(anna, "GET", "/profiles/me")).json().handle;
    await req(clara, "POST", `/profiles/${handle}/follow`);
    expect((await req(clara, "GET", `/media/${mediaId}/medium`)).statusCode).toBe(403); // nur Anfrage
    await req(anna, "POST", `/profiles/requests/${clara.id}/decision`, { decision: "approve" });
    expect((await req(clara, "GET", `/media/${mediaId}/medium`)).statusCode).toBe(200);

    // ungueltige Pfade
    expect((await req(ben, "GET", "/media/nicht-uuid/medium")).statusCode).toBe(400);
    expect((await req(ben, "GET", `/media/${mediaId}/../../etc`)).statusCode).toBe(404);
  });

  it("Feed und Profil liefern die Bilder mit; Vereinsbeitraege mit Bild sind fuer alle sichtbar", async () => {
    await req(anna, "PUT", "/profiles/me", { visibility: "public" });
    const handle = (await req(anna, "GET", "/profiles/me")).json().handle;
    const profilePosts = (await req(ben, "GET", `/profiles/${handle}/posts`)).json().posts;
    expect(profilePosts[0].media).toHaveLength(2);

    await req(anna, "POST", "/orgs", { name: "Foto Verein", category: "Kultur", city: "Fstadt" });
    const img = (await upload(anna, "/media/post", "v.png", await png())).json();
    await req(anna, "POST", "/posts", { body: "Vereinsfoto", orgSlug: "foto-verein", mediaIds: [img.id] });
    expect((await req(clara, "GET", `/media/${img.id}/medium`)).statusCode).toBe(200); // Vereinsbeitraege sind oeffentlich
  });

  it("Beitrag loeschen entfernt auch die Bilddateien", async () => {
    const ids = postWithImages.media.map((m) => m.id);
    expect(await storage.get(`${ids[0]}/medium.webp`)).not.toBeNull();
    expect((await req(anna, "DELETE", `/posts/${postWithImages.id}`)).statusCode).toBe(204);
    for (const id of ids) {
      expect(await storage.get(`${id}/medium.webp`)).toBeNull();
      expect(await storage.get(`${id}/thumb.webp`)).toBeNull();
    }
    expect(await db.select().from(schema.media).where(eq(schema.media.id, ids[0]))).toHaveLength(0);
  });

  it("Aufraeum-Job: unverwendete Uploads werden nach 24 h entfernt, junge bleiben", async () => {
    const old = (await upload(clara, "/media/post", "alt.png", await png())).json();
    const young = (await upload(clara, "/media/post", "jung.png", await png())).json();
    await db.execute(sql`update social.media set created_at = now() - interval '2 days' where id = ${old.id}`);
    expect(await media.cleanupOrphans()).toBe(1);
    expect(await storage.get(`${old.id}/medium.webp`)).toBeNull();
    expect(await storage.get(`${young.id}/medium.webp`)).not.toBeNull();
  });

  it("Kontoloeschung entfernt alle Dateien des Nutzers; Export nennt Anzahl und Groesse", async () => {
    const mine = (await upload(ben, "/media/post", "b1.png", await png())).json();
    const exp = (await req(ben, "GET", "/privacy/export")).json();
    expect(exp.media.count).toBeGreaterThan(0);
    expect(exp.media.bytes).toBeGreaterThan(0);
    expect((await req(ben, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    expect(await storage.get(`${mine.id}/medium.webp`)).toBeNull();
    expect(await storage.get(`${draftId}/medium.webp`)).toBeNull(); // auch der Entwurf von oben
  });
});
