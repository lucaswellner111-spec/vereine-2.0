import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AuthModule } from "./auth/auth.module";
import { AuthService } from "./auth/auth.service";
import { CacheModule } from "./cache/cache.module";
import { createBus } from "./chat/realtime-bus";
import { attachChatGateway } from "./chat/ws-gateway";
import { DbModule } from "./db/db.module";
import { JobsModule } from "./jobs/jobs.module";

@Controller("health")
class GatewayHealthController {
  @Get()
  check() {
    return { status: "ok", service: "chat-gateway" };
  }
}

/** Minimale Anwendung nur fuer den WebSocket-Container: keine Chat-Logik, keine Schluessel. */
@Module({ imports: [DbModule, CacheModule, JobsModule, AuthModule], controllers: [GatewayHealthController] })
class GatewayModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(GatewayModule, new FastifyAdapter({ logger: true, trustProxy: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.CHAT_GATEWAY_PORT ?? 4100);
  await app.listen(port, "0.0.0.0");
  attachChatGateway(app.getHttpServer(), {
    auth: app.get(AuthService),
    bus: createBus(),
    allowedOrigin: process.env.WEB_ORIGIN,
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
