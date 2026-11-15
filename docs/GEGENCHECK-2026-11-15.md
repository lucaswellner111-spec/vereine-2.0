# Opus-Gegencheck 2026-11-15: Befunde und Abarbeitungsliste

Vier unabhängige Prüfer (Sicherheit, Datenschutz/Rechtstexte, Backend-Logik, Frontend) haben `vor-gruendung` gelesen. Kein kritischer Befund, kein IDOR zwischen Vereinen, Schema = Migrationen (keine Drift). Abhaken beim Erledigen. Grundsatz: schlank beheben, kein Overengineering.

## Paket P1: Muss vor Start (Sicherheit/Betrieb)
- [x] Jobs: Wiederhol-Jobs ohne `removeOnComplete` füllen Queue-Redis (256 MB, noeviction) in 3–4 Monaten. `apps/api/src/jobs/jobs.service.ts` `startWorker`/`upsertJobScheduler`: `removeOnComplete: 100, removeOnFail: { age: 7 Tage }`.
- [x] `/api/health/ready` öffentlich mit `failedJobs[].lastError`, Mail-Kontingent, Queue-Zahlen (`apps/api/src/health.controller.ts`, `jobs.service.ts:115-126`). Öffentlich nur `{status}`, Details nur mit `METRICS_TOKEN`.
- [x] Job-Logs loggen rohes `err.message` (SQL samt Parametern): `jobs.service.ts:59,70,95`, `billing/fee-runs.service.ts:114,141,173,208`. `describe()` aus `common/error.filter.ts` wiederverwenden.
- [x] Open Redirect: `apps/web/lib/next-url.ts:7` lässt `/\t/evil.example` durch. Steuerzeichen ablehnen + `new URL(next, origin).origin === origin`. Test dazu.
- [x] 2FA-Pflicht nur für Rolle admin (`orgs/two-factor.guard.ts:23`, `orgs.service.ts:117`): auf treasurer (und Rollen mit Zugriff auf Personendaten) ausweiten. `TwoFactorGuard` fehlt auf `billing.controller.ts` (`GET invoices/:id`, `/pdf`, `DELETE`) und `orgs.controller.ts:66-138` (Rollen, Entfernen, Anträge): als Klassen-Guard mit Ausnahmen.
- [x] Caddy-Zugriffslog schwärzt nur `/api/calendar/`: auch `/einladung/`, `/eltern-einladung/`, `/api/invites/`, Query `t=` (`infra/deploy/Caddyfile.tls` und `Caddyfile`, accesslog-Filter). Mit `caddy validate` prüfen.
- [x] Bei 2FA einschalten und E-Mail-Wechsel `revokeOtherSessions` (`auth/two-factor.service.ts:108-122`, `auth/email-flows.service.ts:140-149`).
- [x] Produktion ohne `WEB_ORIGIN` oder ohne `COOKIE_SECURE=true` darf nicht starten (`app.setup.ts:119-125`, `chat/ws-gateway.ts:45`). Vorher prüfen, dass `.env.preview` auf dem Server beides setzt (nur Variablennamen ansehen, keine Werte ausgeben).
- [x] `chat-crypto.service.ts` `open`: `authTagLength: 16`.
- [x] `orgs.service.ts:104` `q` mit `escapeLike`.
- [-] (bewusst nicht: Export ist schon auf 5/h begrenzt, Passwortdialog wäre eigener UI-Aufwand) Optional/klein: Datenexport mit Passwort bestätigen (`privacy.controller.ts`), wenn ohne großen UI-Aufwand machbar.

## Paket P2: Datenschutz-Texte und Jugend-Logik
- [x] Datenschutzerklärung `apps/web/app/datenschutz/page.tsx`: Abschnitt „Eltern- und Jugendkonten“ (Daten in `youth_profiles`, Elternfreigaben 3 J. pseudonym, Löschung 30 T. nach letztem Elternteil, Ruhen ab 16, Rechte, Art. 8/lit. b, zweiter Elternteil, Import für Kinder aus F1), Fristentabelle (Z. 361-379) erweitern; 2FA-Pflicht für Vorstand (Z. 111); Captcha erwähnen; Cookie-Tabelle um `kn-session` und `onboarding-hidden:<slug>`; Push „Kurztexte (z. B. Termintitel)“ statt „ohne Nutzerinhalte“ (Z. 252); „gekürzte IP-Adresse“ (Z. 83) und Einladungslinks ehrlich.
- [x] Eltern-Hinweise schreiben (eigene Seite oder Abschnitt), im Dialog `components/kinder-admin.tsx:120-158` verlinken, `YOUTH_CONSENT_VERSION` in `packages/shared/src/youth.ts` hochzählen.
- [x] AGB `apps/web/app/agb/page.tsx:31,43,114`: Jugendkonten, 2FA-Pflicht.
- [x] (AVV als Fassung 4 vom 15.11.2026, Vereine stimmen in der Übergangsfrist neu zu) Sicherungsfrist: `infra/ops/lib.sh:24-26` hält 14 täglich/8 wöchentlich/6 monatlich, Texte sagen 14 Tage. Entscheidung: auf 14 täglich + 4 wöchentlich kürzen und alle Texte (Datenschutz Z. 378, `packages/shared/src/avv.ts:215`, `docs/LOESCHKONZEPT.md`, `docs/TOM.md`, `docs/BETRIEB.md`) auf „bis zu 5 Wochen“ setzen. (AVV-Text ändern → `AVV_VERSION` prüfen.)
- [x] `identity.consents` append-only per Trigger (Migration 0034; Löschen nur per Cascade der Kontolöschung), plus Test.
- [x] `LEGAL_VERSION`: Kommentar `packages/shared/src/index.ts:31` und Datenschutz Z. 449 ehrlich formulieren (keine erzwungene Neu-Zustimmung), statt Dialog zu bauen.
- [x] Ab 16: Eltern-Export/-Löschung nur bis zum 16. Geburtstag (`guardian.service.ts:344,349` `requireActiveChild`, `privacy.service.ts:214-238`); ruhende Jugendkonten nach 12 Monaten löschen (`retention.ts` + `purgeExpired`).
- [x] Graduierungsjob `guardian.service.ts:450-455`: nur unerledigte Fälle, sortiert nach `graduation_due_on`.
- [x] `privacy.service.ts:241` `eraseOrphanedYouth`: Fehler je ID fangen.
- [x] Kontolöschung eines Elternteils: Dialog `apps/web/app/(app)/einstellungen/datenschutz/page.tsx:108-127` nennt betroffene Kinder und 30-Tage-Folge.
- [x] Erledigte `social.reports` 30 Tage Frist (`privacy/retention.service.ts`), in Erklärung (Z. 285) und Löschkonzept.
- [x] Rechnungsentwürfe gelöschter Kinder: Entwürfe löschen (`billing/billing.service.ts:366-373`).
- [x] Kind-Export ohne `email`/`mailSuppressions`/`waitlist` der `*.invalid`-Adresse (`privacy.service.ts:214-225`); `two_factor_required_since` in den Export.
- [x] Hilfe `apps/web/app/hilfe/page.tsx:193`: „Meine Kinder“ erwähnen.
- [x] Merker-Doku: `docs/DATENSCHUTZ-LAUNCH.md` Abschnitt 2/4/5 um Jugend (E1+F1), `invoices.subject_*`, `two_factor_required_since`, `comment_likes`, Captcha; Z. 80 aktualisieren; `docs/VVT.md`, `docs/LOESCHKONZEPT.md`, `docs/OFFENE-PUNKTE.md` (Rechtsfragen aus `docs/welle2/JUGEND-KONZEPT.md` 3.6 und `docs/welle2/F1-DOKU.md` Abschnitt 6). Inhalte aus `docs/welle1/*-DOKU.md`, `docs/welle2/*-DOKU.md` zusammenführen.

## Paket P3: Backend-Logik
- [x] Team löschen kaskadiert alle Termine (`db/schema.ts:478`): Löschen verweigern, solange künftige Termine existieren (Fehlermeldung), oder `set null` per Migration – einfachste ehrliche Variante wählen.
- [x] `teams.service.ts:129` `removeMember`: künftige Zusagen/Helfer der Team-Termine löschen, danach `fillWaitlistsFor`.
- [x] `mail/mail-limits.ts` `orgInvitesOver`: Schlüssel mit `berlinDate()`; `msUntilNextMorning` zwischen 0 und 6 Uhr.
- [x] Import-Einladungen: Sweep-Job für hängende „queued“-Zeilen; `enqueue`-Fehler im Request abfangen (`members/member-import.service.ts:262,336`).
- [x] `notifications.service.ts` `insert`: gelöschte Empfänger/Akteure filtern statt 23503; Aufrufer nach Commit mit `.catch`.
- [x] Neue Indizes (eine Migration): `events.created_by`, `event_attendance.marked_by`, `reports.comment_id`, `member_profiles.fee_class_id`, `invoices.subject_user_id`.
- [x] ICS (`events/ics.ts:51`, `events.service.ts:464`): Dauer 3 h, `SEQUENCE`/`LAST-MODIFIED`, Zukunft priorisieren; einzelnes `\r` in `esc` ersetzen.
- [x] `members.service.ts:499-507` Statistik/`isMinor` mit `berlinDate()`.
- Niedrig/optional: Mitgliedsnummern-Lücken (`members.service.ts:95-107`), Mailzähler zählen abgelehnte Versuche (`mail.service.ts` `check`), verworfene Import-Mail bleibt „Eingeladen“.

## Paket P4: Frontend / iPhone
- [x] `app/layout.tsx:12` `formatDetection: { telephone:false, email:false, address:false, date:false }` (wahrscheinliche Ursache von #418).
- [x] Lightbox `components/lightbox.tsx:37,59,84`: Pinch-Zoom erlauben, Safe-Area für Schließen-Knopf und Zähler.
- [x] Chat-Eingabe `components/chat/thread.tsx:517`: Höhe per JS bis `max-h-40` (kein `field-sizing` in Safari).
- [x] `components/notification-bell.tsx:60,114`: `pointerdown` statt `mousedown`; Position mit Safe-Area.
- [x] Doppelte Absendungen mit `useBusy`: `app/(app)/vereine/[slug]/page.tsx:161,168,174,214`, `app/(app)/einstellungen/datenschutz/page.tsx:94,105,122`, `components/moderation-tool.tsx:67,112,119`. Datenexport-Download Safari-fest (Link anhängen, `revokeObjectURL` per `setTimeout`).
- [x] Pull-to-Refresh (`lib/use-pull-to-refresh.ts:68`): Zugweg per Ref/transform statt `setPull` je Bewegung.
- [x] Befehlspalette (`components/command-palette.tsx`): Touch-Höhe, Schließen-Knopf am Handy, Fußzeile `pointer-coarse:hidden`, alte Antworten verwerfen.
- [x] Kleinkram: `teams-admin.tsx:110` hit-area, Tags-Link Touch-Ziel, `to-pop` hinter Text in `ui.tsx:391,599` → `to-brand-2`, Zeitzone Europe/Berlin in `event-card.tsx`, `kalender/page.tsx`, `kalender/[id]/page.tsx`; `plattform/page.tsx:74,104` Lade/Fehler; reduced-motion lässt `animate-spin`; `verwaltung/vertrag` Metadaten.
- [x] F1-Web-Teile (`kind-guardians.tsx`, `kind-detail.tsx`, `eltern-einladung`, `member-import.tsx`) einmal durchsehen.
- Nicht jetzt (Overengineering/erst nach echtem iPhone-Test): Chat-Höhe per visualViewport, Entwurfsschutz, Kalender-Grid-Tastatur.

## Danach
- E2E-Lauf (einzeln wiederholen, was unter Last scheitert), dann Deploy wie bisher (Backup, Rückfall-Images, Smoke-Test, `docker builder prune`).
- Jugend E3–E5, Postgres-Testlauf, Marketing-Bilder.
