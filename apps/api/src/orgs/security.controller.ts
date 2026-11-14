import { Controller, Get, Header, Inject, UseGuards } from "@nestjs/common";
import type { PublicUser, TwoFactorPolicy } from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { TwoFactorPolicyService } from "../auth/two-factor-policy.service";
import { OrgsService } from "./orgs.service";

@Controller("security")
@UseGuards(SessionGuard)
export class SecurityController {
  constructor(
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(TwoFactorPolicyService) private readonly policy: TwoFactorPolicyService,
  ) {}

  /** Gilt fuer mich die Zwei-Faktor-Pflicht, bis wann, und bin ich schon gesperrt? (Banner im Web) */
  @Get("two-factor")
  @Header("Cache-Control", "private, no-store")
  async twoFactor(@CurrentUser() user: PublicUser): Promise<TwoFactorPolicy> {
    return this.policy.evaluate(user.id, { platformAdmin: !!user.isPlatformAdmin, orgAdmin: await this.orgs.isAnyAdmin(user.id) });
  }
}
