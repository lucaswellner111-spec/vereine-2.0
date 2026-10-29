import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { PrivacyModule } from "./privacy/privacy.module";

@Module({
  imports: [DbModule, AuthModule, PrivacyModule],
  controllers: [HealthController],
})
export class AppModule {}
