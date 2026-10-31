import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { LocalStorage, StorageService } from "./storage.service";

@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [MediaController],
  providers: [MediaService, { provide: StorageService, useClass: LocalStorage }],
  exports: [MediaService],
})
export class MediaModule {}
