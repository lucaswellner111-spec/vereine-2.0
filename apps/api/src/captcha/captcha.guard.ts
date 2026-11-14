import { BadRequestException, type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CAPTCHA_FAILED_CODE, CAPTCHA_FAILED_MESSAGE, CAPTCHA_HEADER } from "@vereine/shared";
import { CaptchaService, captchaEnabled } from "./captcha.service";

/**
 * Verlangt eine geloeste Proof-of-Work-Aufgabe im Header `X-Captcha` (Registrierung, Passwort vergessen, Warteliste,
 * Mitgliedsantrag). Aus, solange `captchaEnabled()` false ist (Tests/E2E/Entwicklung). Bei Fehlern immer dieselbe
 * 400-Antwort mit Code `CAPTCHA_FAILED`; Details werden nicht verraten.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!captchaEnabled()) return true;
    const token = ctx.switchToHttp().getRequest<FastifyRequest>().headers[CAPTCHA_HEADER];
    if (!(await this.captcha.verifyAndConsume(Array.isArray(token) ? token[0] : token))) {
      throw new BadRequestException({ statusCode: 400, message: CAPTCHA_FAILED_MESSAGE, code: CAPTCHA_FAILED_CODE });
    }
    return true;
  }
}
