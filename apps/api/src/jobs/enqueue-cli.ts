import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { JobsService } from "./jobs.service";

/** Betriebs-Werkzeug: einen Job einmalig einreihen, z. B. `node dist/jobs/enqueue-cli.js sessions.purge`. */
async function main() {
  const name = process.argv[2];
  if (!name) throw new Error("Aufruf: enqueue-cli <jobname>");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const jobs = app.get(JobsService);
  await jobs.enqueue(name, {});
  console.log(`Job "${name}" eingereiht (Modus: ${jobs.mode}).`, JSON.stringify(await jobs.stats()));
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
