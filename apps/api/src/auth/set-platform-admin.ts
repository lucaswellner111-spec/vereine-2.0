import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AuthService } from "./auth.service";

/**
 * Betriebs-Werkzeug: Plattform-Moderation vergeben oder entziehen. Es gibt bewusst keinen Web-Weg dafuer.
 *   node dist/auth/set-platform-admin.js <e-mail>            -> vergeben
 *   node dist/auth/set-platform-admin.js <e-mail> --revoke   -> entziehen
 */
async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) throw new Error("Aufruf: set-platform-admin <e-mail> [--revoke]");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const ok = await app.get(AuthService).setPlatformAdmin(email, flag !== "--revoke");
  console.log(ok ? `Plattform-Moderation ${flag === "--revoke" ? "entzogen" : "vergeben"}: ${email}` : `Kein Konto mit ${email}`);
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
