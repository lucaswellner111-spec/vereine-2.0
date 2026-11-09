// Lokaler Entwicklungsserver OHNE Docker/Postgres: nutzt eine In-Memory-PGlite-Datenbank.
// Daten gehen beim Beenden verloren. Start: npm run dev:pglite -w @vereine/api
import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { AppModule } from "../src/app.module";
import { configureApp, fastifyOptions } from "../src/app.setup";
import { AuthService } from "../src/auth/auth.service";
import { REALTIME_BUS } from "../src/chat/realtime-bus";
import { attachChatGateway } from "../src/chat/ws-gateway";
import { DB } from "../src/db/db.module";
import * as schema from "../src/db/schema";
import { MemoryMailDriver } from "../src/mail/mail.drivers";
import { MAIL_DRIVER } from "../src/mail/mail.service";


async function main() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });

  // Nur lokal: Mails landen im Speicher statt im Postfach (MAIL_DRIVER=smtp nutzt weiter den echten Versand).
  const outbox = process.env.MAIL_DRIVER === "smtp" ? null : new MemoryMailDriver();
  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db);
  if (outbox) builder = builder.overrideProvider(MAIL_DRIVER).useValue(outbox);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyOptions()));
  await configureApp(app, { rateLimit: false });
  if (outbox) {
    // Entwicklung/E2E: letzte Mail an eine Adresse lesen (Bestaetigungs-/Passwort-Links). Gibt es NUR in diesem Dev-Server.
    app.getHttpAdapter().getInstance().get("/__dev/mails", async (req, reply) => {
      const { to, template } = req.query as { to?: string; template?: string };
      const mail = to ? outbox.last(to, template as never) : undefined;
      if (!mail) return reply.status(404).send({ message: "Keine Mail." });
      return { template: mail.template, subject: mail.subject, text: mail.text, headers: mail.headers ?? {} };
    });
  }
  await app.listen(Number(process.env.API_PORT ?? 4000), "127.0.0.1");
  attachChatGateway(app.getHttpServer(), { auth: app.get(AuthService), bus: app.get(REALTIME_BUS) });
  // Nur lokal: Konto mit dieser E-Mail wird (sobald es existiert) zur Plattform-Moderation, um die Oberflaeche zu testen.
  if (process.env.DEV_PLATFORM_ADMIN) {
    setInterval(() => void app.get(AuthService).setPlatformAdmin(process.env.DEV_PLATFORM_ADMIN!, true).catch(() => undefined), 3000).unref();
  }
  console.log("API (PGlite) laeuft auf http://127.0.0.1:" + (process.env.API_PORT ?? 4000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
