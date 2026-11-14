import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { EMAIL_NOT_VERIFIED, TWO_FACTOR_REQUIRED_CODE, TWO_FACTOR_REQUIRED_MESSAGE, type PublicUser, type TwoFactorPolicy } from "@vereine/shared";
import { AuthService } from "./auth.service";
import { TwoFactorPolicyService } from "./two-factor-policy.service";

export const SESSION_COOKIE = "sid";

type AuthedRequest = FastifyRequest & { user?: PublicUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    const user = token ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

/** Nur Plattform-Moderation (Rolle per CLI vergeben). Nicht angemeldet = 401, angemeldet ohne Rolle = 403. */
@Injectable()
export class PlatformAdminGuard extends SessionGuard {
  constructor(
    @Inject(AuthService) auth: AuthService,
    @Inject(TwoFactorPolicyService) private readonly policy: TwoFactorPolicyService,
  ) {
    super(auth);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.isPlatformAdmin) throw new ForbiddenException("Nur fuer die Plattform-Moderation.");
    // Zwei-Faktor-Pflicht (sofort, keine Uebergangsfrist): ohne TOTP kein Zugriff auf Moderation und Plattform-Werkzeuge
    assertTwoFactor(await this.policy.evaluate(user.id, { platformAdmin: true, orgAdmin: false }));
    return true;
  }
}

/** Wirft 403 mit Fehlercode, wenn die Pflicht gilt, die Frist um ist und Zwei-Faktor noch fehlt. */
export function assertTwoFactor(state: TwoFactorPolicy): void {
  if (state.blocked) throw new ForbiddenException({ statusCode: 403, message: TWO_FACTOR_REQUIRED_MESSAGE, code: TWO_FACTOR_REQUIRED_CODE });
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthedRequest>().user as PublicUser,
);

/** Aktionen mit Aussenwirkung (Verein gruenden, Einladungen) erst mit bestaetigter E-Mail-Adresse. */
export function requireVerifiedEmail(user: PublicUser): void {
  if (!user.emailVerified) throw new ForbiddenException(EMAIL_NOT_VERIFIED);
}
