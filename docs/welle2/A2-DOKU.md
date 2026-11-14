# Paket A2: Sicherheit und Konten härten (Stand 2026-11-14)

Alles ohne Drittanbieter (selbst gehostet, EU). Migration: **0029** (`users.two_factor_required_since`); 0030 blieb frei.
Neue Server-Variablen stehen gesammelt unter „Betrieb“. Die Sammel-Docs (`DATENSCHUTZ-LAUNCH.md`, `OFFENE-PUNKTE.md`) wurden bewusst nicht angefasst; dieser Text ist die Vorlage zum Übernehmen.

## 1. Zwei-Faktor-Pflicht (TOTP)
- **Wer:** Vorstände (Rolle `admin` in mindestens einem Verein) und Plattform-Admins. Kassenwart/Moderation: empfohlen, nicht Pflicht.
- **Frist:** Konstante `TWO_FACTOR_GRACE_DAYS` in `auth/two-factor-policy.service.ts`: Vorstände 14 Tage ab dem ersten Prüfen, Plattform-Admins 0 Tage (sofort). Der Fristbeginn steht in `identity.users.two_factor_required_since` (wird beim ersten Aufruf gesetzt).
- **Wirkung nach Fristende (403, Code `TWO_FACTOR_REQUIRED`):** Mitgliederregister/CSV/Beitragsklassen, Rechnungen und Beitragsläufe, Einladungen und Import, Vereins-Rechnungsprofil, Moderation (Meldungen, Beiträge/Kommentare), alle `/platform/*`-Routen. Erreichbar bleiben Anmeldung, Einstellungen/Sicherheit (Einrichtung) und alles Lesen von Feed und Verein.
- **Oberfläche:** Banner im App-Rahmen (`TwoFactorBanner`, Quelle `GET /security/two-factor`) mit Frist bzw. Sperrhinweis und Link zur Einrichtung. Die Einrichtung (QR, Code, 10 Notfallcodes, „Neue Notfallcodes“) gab es schon; Text dort nennt jetzt die Pflicht.
- **Schalter:** `TWOFACTOR_ENFORCE=true|false`. Ohne Angabe: an bei `NODE_ENV=production`, sonst aus (Tests, dev:pglite, E2E laufen ohne Zwang).
- **Datenschutz:** keine neuen personenbezogenen Daten; ein Zeitstempel je Konto (Zweck: Fristberechnung, Löschung mit dem Konto). 2FA-Geheimnis/Notfallcodes wie bisher (verschlüsselt bzw. Argon2-Hash).
- **Hinweis:** Wer 2FA wieder ausschaltet, bleibt gesperrt, sobald die Frist vorbei ist (Fristbeginn wird nicht zurückgesetzt).

## 2. Bot-Abwehr (Proof-of-Work, Stil ALTCHA, eigene Umsetzung)
- **Wo:** `POST /auth/register`, `/auth/password/forgot`, `/waitlist`, `/orgs/:slug/membership` (Mitgliedsantrag) per `CaptchaGuard`; Header `X-Captcha` (base64-JSON der gelösten Aufgabe).
- **Ablauf:** `GET /captcha/challenge` → `{challenge = SHA-256(salt+n), salt?expires=…, signature = HMAC(challenge|salt), maxnumber 150000}`. Der Browser sucht n (im Mittel ca. 75 000 Hashes, unter einer Sekunde, ohne Zutun der Person, gechunkt damit die Seite bedienbar bleibt). Server prüft: Signatur (konstante Zeit, Teilschlüssel `derivedKey("captcha")` aus `AUTH_SECRET_KEY`), Ablauf (10 Minuten), Hash, **Einmalverwendung** (`SET NX` auf die Signatur in Redis; Cache-Ausfall = ablehnen). Aufgaben-Ausgabe: 60 pro Minute und IP (IP nur gehasht im Zähler).
- **Lizenz/CSP:** eigene Implementierung (SHA-256 selbst geschrieben, `apps/web/lib/sha256.ts`, gegen `node:crypto` getestet), keine Bibliothek, kein CDN, kein Web Worker (`worker-src 'self'` genügt ohnehin). Keine zusätzlichen CSP-Quellen nötig.
- **Barrierefrei:** keine Bilder, keine Rätsel, keine Bedienung; läuft automatisch beim Absenden. Hinweistext unter den Formularen (`CaptchaNote`). Kein WebCrypto nötig (funktioniert auch über HTTP). Ohne JavaScript funktionieren die Formulare ohnehin nicht (SPA). Grenze: sehr alte Geräte brauchen etwas länger; Schwierigkeit über `CAPTCHA_MAX_NUMBER` (Server) anpassbar.
- **Schalter:** `CAPTCHA_ENFORCE=true|false`; ohne Angabe nur in Produktion. `GET /captcha/config` sagt dem Web, ob es überhaupt lösen muss.
- **Datenschutz:** keine personenbezogenen Daten gespeichert; im Cache liegt kurzzeitig nur die Signatur eingelöster Aufgaben (bis 15 Minuten). Bestehende Schutzschichten (Honeypot und Zeitprüfung der Warteliste, IP-/Adress-Limits, Mail-Kostenbremse) bleiben.
- **Nicht Teil:** Login ist nicht geschützt (dort greifen Fehlversuch-Sperren je E-Mail/IP und 2FA).

## 3. Bounce-/Beschwerde-Webhook (Scaleway TEM)
- **Endpunkt:** `POST https://klubnest.de/api/mail/webhook/scaleway` (Caddy entfernt `/api`). Antwort 202 `{accepted, ignored}`.
- **Signatur:** Header `X-Klubnest-Timestamp` (Unix-Sekunden) und `X-Klubnest-Signature` = hex(HMAC-SHA256(`MAIL_WEBHOOK_SECRET`, `<Timestamp>.<Rohkörper>`)), optional mit Präfix `sha256=`. Vergleich in konstanter Zeit, Zeitfenster ±5 Minuten, jede Signatur nur einmal (Replay-Schutz in Redis), Rohkörper nur für diese Route gelesen (max. 256 KB, `preParsing`-Hook in `app.setup.ts`). Ohne Secret (mind. 32 Zeichen) ist die Route aus (404).
- **Wirkung:** nur **harte** Bounces und Beschwerden rufen `SuppressionsService.recordBounce` (Sperre `all`, Fristen 12 Monate wie bisher). Weiche/vorübergehende Bounces, Zustellungen, Verzögerungen und alles Unklare (z. B. Bounce ohne Art) werden ignoriert. Logs nennen nur Zahlen, nie Adressen.
- **Offen/unverifiziert:** Scaleway TEM liefert Ereignisse über „Topics and Events“ (SNS/HTTP) bzw. Cockpit; ein **eigener HMAC-Header** setzt Scaleway nicht von sich aus. Zwei Wege: (a) kleiner Relay/Regel, der Ereignisse mit obiger Signatur weiterleitet, (b) Signaturprüfung auf das Scaleway-Format umstellen, sobald das Format am Konto geprüft ist (nur `bounce-webhook.service.ts`, Funktionen `handle`/`classifyEvent`). Das Ereignisformat ist tolerant gebaut (Adresse in `email|recipient|to`, Art in `type|event|status`, Bounce-Art in `bounce_type|subtype`), aber nicht gegen echte Scaleway-Daten geprüft.

## 4. SMTP-Zugang nur im Worker
- Der Mail-Treiber wird erst beim Versand angelegt (`LazyMailDriver`); die API startet ohne `SMTP_*`/`MAIL_FROM` und zeigt weiter den Treibernamen in `/health/ready`. Der Worker prüft die Konfiguration beim Start (`MailService.assertDriverReady`, Fehlkonfiguration beendet den Worker).
- `docker-compose.preview.yml`: `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `MAIL_REPLY_TO` nur noch beim Dienst `worker`. Die API bekommt `MAIL_DRIVER` (für die Anzeige), die Limits und `MAIL_WEBHOOK_SECRET`.

## 5. CSP mit Nonces
- `apps/web/middleware.ts` + `lib/csp.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `style-src-attr 'unsafe-inline'` (nur Attribute, Nonces wirken dort nicht), `connect-src 'self' wss:` (wss:-Hinweis: lokal über HTTP fällt der Chat in E2E weiter auf Polling zurück), sonst unverändert. Nur im Produktions-Build; Seiten sind dadurch dynamisch gerendert (Layout liest den Nonce). `next.config.ts` setzt für `/sw.js` eine eigene schmale CSP.
- E2E `security.spec.ts` prüft Header (Nonce wechselt, kein `unsafe-inline` bei Skripten/Stilen) und sammelt `securitypolicyviolation`-Ereignisse auf Start-, Login- und App-Seite.

## 6. Altkonten ohne bestätigte Adresse
Entscheidung umgesetzt: lesen und anmelden dürfen sie weiter; Bestätigung nötig für alles mit Außenwirkung. Geschlossene Lücken: **Mitglieder-Import (Versand)**, **Beitragslauf anlegen**, **Rechnung finalisieren/versenden** (zusätzlich zu Verein gründen, Einladungen, AVV, Sammelmail). Banner „Link erneut senden“ gab es; Rate-Limit je IP und Adresse greift im Dienst. Test: `auth/legacy-accounts.spec.ts`. Rechtlich offen bleibt nur, ob Altkonten eine Bestätigung nach Frist erzwingen sollen (Demo-Konten haben `.invalid`-Adressen).

## 7. Passkeys (WebAuthn): nicht gebaut, begründet
Technisch ohne Drittanbieter möglich (`@simplewebauthn/server` + `/browser`, MIT, selbst gebündelt). Zurückgestellt, weil mehrere Entscheidungen offen sind, die nicht „nebenbei“ fallen sollten: (1) Relying-Party-ID und Origins je Umgebung (klubnest.de vs. Vorschau), später Domainwechsel macht alle Passkeys ungültig; (2) Passkey als **zusätzlicher** Faktor oder als Passwort-Ersatz (Auswirkung auf Konto-Wiederherstellung, Notfallcodes, 2FA-Pflicht: zählt ein Passkey als zweiter Faktor?); (3) neue Tabelle (Credential-ID, Public Key, Zähler, Name, Gerätetyp) samt Export/Löschung/Frist; (4) Login-Ablauf mit Challenge im Cache und Tests mit simuliertem Authenticator. Aufwand grob 1 bis 1,5 Tage mit Tests. Migration 0030 ist dafür frei.

## 8. Quick Wins
- **Einladungen beim Löschen des einzigen Vorstands:** `OrgAdminService.revokeOpenInvites` vor der Kontosperre (Link- und Import-Einladungen), auch wenn der Nachlauf abbricht.
- **Plattform-Werkzeug „Vorstand setzen“:** `POST /platform/orgs/:slug/admin {email}` und Karte auf `/plattform`; nur bei Vereinen **ohne** aktiven Vorstand (sonst 409), legt die Mitgliedschaft an oder hebt sie auf (aktiv, admin), 2FA-Pflicht gilt, Audit `platform.org.admin.set` (24 Monate; die Zielperson wird bei Kontolöschung aus der Meta entkoppelt).
- **Fehlgeschlagene Jobs:** `/health/ready` zeigt bei `jobs.failed > 0` zusätzlich `failedJobs` (Jobname, Anzahl, gekürzte Fehlerart ohne Adressen, nie Jobdaten). Fehlgeschlagene Jobs bleiben jetzt 7 Tage (statt unbegrenzt bis 5000). **Der eine alte Job auf dem Server wurde nicht geprüft** (kein Serverzugriff in diesem Paket): nach dem Deploy `curl /api/health/ready` ansehen; vermutlich ein `mail.send` aus der Zeit vor der SMTP-Konfiguration.
- **Anwesenheitsliste:** `AttendanceEntry.handle`, Name ist Profil-Link (`UserNameLink`).

## Betrieb: neue Variablen (nur in `/opt/vereine/.env`, nie im Repo)
| Variable | Dienst | Zweck |
|---|---|---|
| `MAIL_WEBHOOK_SECRET` | api | HMAC-Secret des Bounce-Webhooks (`openssl rand -hex 32`, mind. 32 Zeichen); leer = Webhook aus |
| `TWOFACTOR_ENFORCE` | api | leer = an in Produktion; `false` = aus (Notausschalter) |
| `CAPTCHA_ENFORCE` | api | leer = an in Produktion; `false` = aus |
| `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO` | **nur worker** | wie bisher, aber nicht mehr bei `api` |

Nach dem Deploy prüfen: Registrierung und „Passwort vergessen“ im Browser (Captcha läuft unsichtbar), `/api/health/ready` (`mail.driver`, `failedJobs`), Vorstand ohne 2FA sieht das Banner, Test-Webhook mit Signatur.

## Risiken
- Captcha + 2FA-Pflicht sind in Produktion **standardmäßig an**: ein Fehler in der Signatur/Uhrzeit (Server-Zeit) kann Registrierungen blockieren; Notausschalter `CAPTCHA_ENFORCE=false`.
- CSP-Nonce macht alle Seiten dynamisch (mehr Rechenzeit je Seitenaufruf, kein statisches Ausliefern); Inline-Stile an Elementen bleiben erlaubt.
- Webhook-Format von Scaleway nicht verifiziert (siehe 3).
