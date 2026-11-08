import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { MediaModule } from "../media/media.module";
import { OrgsModule } from "../orgs/orgs.module";
import { PostsModule } from "../posts/posts.module";
import { PublicController } from "./public.controller";
import { PublicMediaRateLimitGuard, PublicRateLimitGuard } from "./public-rate-limit.guard";
import { PublicService } from "./public.service";

/** Oeffentlicher Bereich ohne Login (Vereinsseite /verein/<slug>, Vereinsfinder). */
@Module({
  imports: [OrgsModule, EventsModule, PostsModule, MediaModule],
  controllers: [PublicController],
  providers: [PublicService, PublicRateLimitGuard, PublicMediaRateLimitGuard],
})
export class PublicModule {}
