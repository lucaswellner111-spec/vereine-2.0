import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { AuthService } from "./auth/auth.service";
import { REALTIME_BUS } from "./chat/realtime-bus";
import { attachChatGateway } from "./chat/ws-gateway";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true }),
  );
  await configureApp(app);
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  // Ohne Redis (lokal) laeuft das WebSocket-Gateway im selben Prozess; in Produktion als eigener Container.
  if (!process.env.REDIS_URL || process.env.CHAT_WS_INPROCESS === "true") {
    attachChatGateway(app.getHttpServer(), { auth: app.get(AuthService), bus: app.get(REALTIME_BUS), allowedOrigin: process.env.WEB_ORIGIN });
  }
}

bootstrap();
