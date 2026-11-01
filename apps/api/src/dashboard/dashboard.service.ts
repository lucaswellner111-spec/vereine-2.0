import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { OrgDashboard, PublicUser } from "@vereine/shared";
import { BillingService } from "../billing/billing.service";
import { EventsService } from "../events/events.service";
import { MembersService } from "../members/members.service";
import { OrgsService } from "../orgs/orgs.service";

/** Vereinsuebersicht: fasst Kennzahlen der Bereiche zusammen (ueber deren Dienste, nie ueber fremde Tabellen). */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async get(user: PublicUser, slug: string): Promise<OrgDashboard> {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (role !== "admin" && role !== "treasurer") throw new ForbiddenException("Nur Vorstand und Kassenwart sehen die Übersicht.");
    const [detail, pending, stats, invoices, upcoming] = await Promise.all([
      this.orgs.detail(slug, user.id),
      this.orgs.pendingCount(org.id),
      this.members.stats(org.id),
      this.billing.dashboard(org.id),
      this.events.listForOrg(user, slug, { from: new Date().toISOString() }),
    ]);
    return {
      members: detail.members,
      pendingRequests: pending,
      newMembers30d: stats.newMembers30d,
      minors: stats.minors,
      invoices,
      upcomingEvents: upcoming.filter((e) => !e.canceled).slice(0, 5).map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, yes: e.counts.yes })),
      byFeeClass: stats.byFeeClass,
      joinsByMonth: stats.joinsByMonth,
    };
  }
}
