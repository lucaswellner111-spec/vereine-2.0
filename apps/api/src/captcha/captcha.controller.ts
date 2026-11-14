import { createHmac } from "node:crypto";
import { Controller, Get, Header, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { CaptchaChallenge, CaptchaConfig } from "@vereine/shared";
import { CACHE, type Cache } from "../cache/cache.module";
import { enforceLimit } from "../common/rate-limit";
import { derivedKey } from "../common/secret-key";
import { CaptchaService, captchaEnabled } from "./captcha.service";

/** Aufgaben je IP und Minute (Formulare holen je eine; grosszuegig fuer Vereinsabende im selben WLAN). */
export const CAPTCHA_CHALLENGES_PER_IP_MIN = 60;

@Controller("captcha")
export class CaptchaController {
  constructor(
    @Inject(CaptchaService) private readonly captcha: CaptchaService,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  /** Ob die Pruefung auf diesem Server aktiv ist (das Web zeigt sonst kein Widget). */
  @Get("config")
  @Header("Cache-Control", "no-store")
  config(): CaptchaConfig {
    return { enabled: captchaEnabled() };
  }

  @Get("challenge")
  @Header("Cache-Control", "no-store")
  async challenge(@Req() req: FastifyRequest): Promise<CaptchaChallenge> {
    // IP nur gehasht im Zaehler-Schluessel (wie bei der Warteliste)
    const ip = createHmac("sha256", derivedKey("captcha-ip")).update(req.ip ?? "").digest("hex");
    await enforceLimit(this.cache, `captcha:ip:${ip}`, CAPTCHA_CHALLENGES_PER_IP_MIN, 60, "Zu viele Anfragen. Bitte warte einen Moment.");
    return this.captcha.createChallenge();
  }
}
