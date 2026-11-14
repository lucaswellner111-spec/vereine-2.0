import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { PublicUser } from "@vereine/shared";
import { assertTwoFactor } from "../auth/session.guard";
import { TwoFactorPolicyService } from "../auth/two-factor-policy.service";
import { OrgsService } from "./orgs.service";

/**
 * Nach `SessionGuard` auf sensiblen Routen (Mitgliederdaten, Rechnungen, Einladungen, Moderation): Vorstaende ohne
 * Zwei-Faktor werden nach der Uebergangsfrist gesperrt. Wirkt nur fuer Vorstaende/Plattform-Admins und nur, wenn die
 * Pflicht auf dem Server aktiv ist (twoFactorEnforced); alle anderen Rollen passieren ohne Zusatzabfrage.
 */
@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(TwoFactorPolicyService) private readonly policy: TwoFactorPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<FastifyRequest & { user?: PublicUser }>().user;
    if (!user) return true; // SessionGuard laeuft davor
    const state = await this.policy.evaluate(user.id, { platformAdmin: !!user.isPlatformAdmin, orgAdmin: await this.orgs.isAnyAdmin(user.id) });
    assertTwoFactor(state);
    return true;
  }
}
