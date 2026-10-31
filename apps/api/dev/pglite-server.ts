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
import { configureApp } from "../src/app.setup";
import { AuthService } from "../src/auth/auth.service";
import { REALTIME_BUS } from "../src/chat/realtime-bus";
import { attachChatGateway } from "../src/chat/ws-gateway";
import { DB } from "../src/db/db.module";
import * as schema from "../src/db/schema";


async function main() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: true }));
  await configureApp(app, { rateLimit: false });
  await app.listen(Number(process.env.API_PORT ?? 4000), "127.0.0.1");
  attachChatGateway(app.getHttpServer(), { auth: app.get(AuthService), bus: app.get(REALTIME_BUS) });
  console.log("API (PGlite) laeuft auf http://127.0.0.1:" + (process.env.API_PORT ?? 4000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
