import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JobsService } from "./jobs/jobs.service";
import { MailService } from "./mail/mail.service";

/**
 * Worker-Prozess (eigener Container). Startet keinen HTTP-Server, laedt dieselben Module wie die API
 * (damit alle Job-Handler definiert sind) und verarbeitet die BullMQ-Warteschlange.
 */
async function bootstrap() {
  const log = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  app.enableShutdownHooks();
  app.get(MailService).assertDriverReady(); // SMTP-Zugang liegt nur hier: Fehlkonfiguration sofort melden
  const jobs = app.get(JobsService);
  if (jobs.mode !== "bullmq") {
    log.error("QUEUE_REDIS_URL/REDIS_URL fehlt: der Worker braucht Redis.");
    process.exit(1);
  }
  await jobs.startWorker();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
