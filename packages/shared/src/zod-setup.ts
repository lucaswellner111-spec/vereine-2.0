import { z } from "zod";

/**
 * Im Browser ohne JIT: Zod prueft sonst beim Anlegen jedes Objekt-Schemas per `new Function("")`, ob eval erlaubt ist.
 * Die Pruefung wird zwar abgefangen, loest unter unserer CSP (kein 'unsafe-eval') aber bei jedem Seitenaufruf einen
 * `securitypolicyviolation` (script-src eval) aus. Auf dem Server (kein `document`) bleibt der schnelle JIT-Pfad an.
 * Muss VOR dem ersten Schema geladen werden: in jeder Datei, die Schemas anlegt, als erster Import.
 */
if ((globalThis as { document?: unknown }).document !== undefined) z.config({ jitless: true });
