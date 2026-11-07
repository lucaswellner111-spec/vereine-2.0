import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrgsModule } from "../orgs/orgs.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { LocalStorage, StorageService } from "./storage.service";

@Module({
  imports: [AuthModule, ProfilesModule, OrgsModule],
  controllers: [MediaController],
  providers: [MediaService, { provide: StorageService, useClass: LocalStorage }],
  exports: [MediaService],
})
export class MediaModule {}
