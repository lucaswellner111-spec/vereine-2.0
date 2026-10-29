import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@vereine/shared";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "api", time: new Date().toISOString() };
  }
}
