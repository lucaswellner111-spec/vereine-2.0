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
import type { PublicUser } from "@vereine/shared";
import { AuthService } from "./auth.service";

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
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.isPlatformAdmin) throw new ForbiddenException("Nur fuer die Plattform-Moderation.");
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthedRequest>().user as PublicUser,
);
