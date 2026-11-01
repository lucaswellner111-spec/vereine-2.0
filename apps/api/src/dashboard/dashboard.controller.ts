import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import type { OrgDashboard, PublicUser } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { DashboardService } from "./dashboard.service";

@Controller("orgs")
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get(":slug/dashboard")
  get(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<OrgDashboard> {
    return this.dashboard.get(user, slug);
  }
}
