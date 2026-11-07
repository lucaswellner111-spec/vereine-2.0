import { ArgumentsHost, BadRequestException, Catch, ConflictException, HttpException, InternalServerErrorException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { pgCode } from "./pg-errors";

const FASTIFY_TEXT: Record<string, string> = {
  FST_REQ_FILE_TOO_LARGE: "Bild ist größer als 8 MB.",
};

/**
 * Globaler Fehlerfilter: HttpException unveraendert, bekannte Datenbank-/Fastify-Fehler als 4xx mit deutschem Text,
 * alles andere als 500 ohne Details. DATENSCHUTZ: DrizzleQueryError enthaelt SQL samt Parametern (Nutzerdaten) in
 * `message` - geloggt werden nur Fehlerart, pg-Code, Methode und Routenmuster.
 */
@Catch()
export class AppErrorFilter extends BaseExceptionFilter {
  private readonly log = new Logger("AppErrorFilter");

  override catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) return super.catch(exception, host);

    const code = pgCode(exception);
    if (code?.startsWith("22")) return super.catch(new BadRequestException("Ungültige Eingabe."), host);
    if (code === "23505") return super.catch(new ConflictException("Dieser Eintrag existiert bereits."), host);

    const fst = exception as { code?: unknown; statusCode?: unknown; message?: unknown } | null;
    if (typeof fst?.code === "string" && fst.code.startsWith("FST_") && typeof fst.statusCode === "number" && fst.statusCode >= 400 && fst.statusCode < 500) {
      const text = FASTIFY_TEXT[fst.code] ?? (typeof fst.message === "string" ? fst.message : "Ungültige Anfrage.");
      return super.catch(new HttpException({ statusCode: fst.statusCode, message: text }, fst.statusCode), host);
    }

    this.log.error(this.describe(exception, host, code));
    return super.catch(new InternalServerErrorException(), host);
  }

  /** Bereinigte Logzeile: nie die Meldung (DB-Fehler enthalten Parameter), sonst Name + Stack-Rahmen. */
  private describe(exception: unknown, host: ArgumentsHost, code: string | undefined): string {
    const req = host.getType() === "http" ? host.switchToHttp().getRequest<FastifyRequest>() : undefined;
    const where = req ? `${req.method} ${req.routeOptions?.url ?? "?"}` : host.getType();
    const err = exception as { name?: string; stack?: string; query?: unknown } | null;
    const name = err?.name ?? typeof exception;
    const isDb = !!code || name === "DrizzleQueryError" || (err != null && typeof err === "object" && "query" in err);
    if (isDb) return `${where}: ${name}${code ? ` (pg ${code})` : ""}`;
    // Nur Fehlername + Stack-Rahmen, nie die Meldung (fremde Bibliotheken schreiben dort teils Nutzerdaten hinein).
    const frames = (err?.stack ?? "").split("\n").filter((l) => l.trimStart().startsWith("at ")).slice(0, 8).join("\n");
    return `${where}: ${name}${frames ? `\n${frames}` : ""}`;
  }
}
