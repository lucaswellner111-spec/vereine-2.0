import type { INestApplicationContext } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { users } from "../db/schema";

/**
 * Nur Tests: E-Mail-Adresse eines frisch registrierten Kontos als bestaetigt markieren (statt den Link aus der Mail
 * zu klicken). Danach klappt die Anmeldung und Verein gruenden/Einladungen sind erlaubt. Den echten Ablauf pruefen
 * auth/email-flows.spec.ts und die E2E-Tests.
 */
export async function confirmEmailForTest(app: INestApplicationContext, email: string): Promise<void> {
  const db = app.get<Database>(DB);
  await db.update(users).set({ emailVerifiedAt: new Date(), pendingVerification: false }).where(eq(users.email, email.trim().toLowerCase()));
}
