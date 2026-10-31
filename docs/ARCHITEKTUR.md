# Architektur- und Server-Strategie

**Leitidee:** Ein Server, solange es geht – aber so gebaut, dass jeder Bereich später ohne Umbau auf einen eigenen Server ziehen kann. Wir trennen zuerst in **Prozessen/Containern** (kostet nichts), dann auf **Servern** (kostet Geld), und zwar erst, wenn eine Messgröße es verlangt.

## Stufen

| Stufe | Aufbau | Wann |
|---|---|---|
| **0 (jetzt)** | 1 Server: Caddy, web, api, Postgres, Redis | bis ein Auslöser (unten) greift |
| **1** | Selbe Maschine, aber getrennte Container: `api`, `chat`, `worker` (Mail, Jobs), `payments`, je eigene Zugangsdaten | sobald Chat/Zahlungen/Mail gebaut werden |
| **2** | **DB-Server** eigene Maschine (Postgres + pgBouncer + Backups), App-Server getrennt | erster Auslöser: DB belastet die App (Speicher/CPU/IO) |
| **3** | **Chat-Server** (WebSocket-Gateway + eigener Postgres-Schema/DB + Redis), App-Server skaliert horizontal hinter Load Balancer | ab ca. 2.000 gleichzeitigen Verbindungen oder Chat-Last stört API |
| **4** | **Zahlungs-Server** (isoliert, nur Provider-Webhooks + Abrechnung), **Mail-Server/Provider** | mit Start echter Zahlungen bzw. bei Mail-Volumen/Reputation |
| **5** | Read-Replica, Redis getrennt, Suche (Meilisearch), Object-Storage-CDN | Wachstum |

## Trennlinien (werden jetzt schon im Code eingehalten)
1. **Ein Modul = ein Bereich = eigene Datenbank-Rolle und eigenes Schema.** Kein Modul liest/schreibt Tabellen eines anderen direkt; nur über dessen Dienst (Service-Schnittstelle). Dann zieht ein Schema 1:1 auf einen anderen Server.
   - `identity` (users, sessions, consents, audit), `social` (orgs, posts, events, teams, notifications), `chat` (conversations, messages, keys), `billing` (donations, invoices, payments, receipts).
2. **Prozess-Trennung per Container:** `api` (HTTP), `chat` (WebSocket, eigener Port), `worker` (BullMQ: Mail, Erinnerungen, Fan-out, Aufräumen), `payments` (Webhooks, Provider-Schlüssel). Gleiches Image, andere Startkommandos → später auf andere Hosts verschiebbar.
3. **Kommunikation nur über definierte Wege:** HTTP (intern), Redis-Queues/Pub-Sub, **nie** über gemeinsame Tabellen. Identität wird über signierte Session/Token geprüft, nicht über direkten DB-Zugriff.
4. **Konfiguration nur per Umgebungsvariablen** (`DATABASE_URL_<BEREICH>`, `REDIS_URL`, `MAIL_URL`, `PAYMENTS_URL`). Heute zeigen alle auf dieselbe Maschine.
5. **Secrets je Dienst getrennt:** Zahlungs-Schlüssel nur im `payments`-Container, Chat-Schlüssel nur im `chat`-Container, Mail-Zugang nur im `worker`. Ein Einbruch in `web` gibt keine Zahlungs- oder Chat-Daten frei.
6. **Interne Netze:** DB/Redis nie öffentlich; Dienste sprechen über das private Netz (Docker-Netz jetzt, Hetzner-Private-Network später).

## Sicherheit und Datenschutz (Grund für die Trennung)
- **Chat getrennt:** serverseitig verschlüsselte Nachrichten, eigene Schlüssel (Vault/KMS), eigene Löschfristen; Moderation nur auf gemeldete Nachrichten.
- **Zahlungen getrennt:** Karten-/Kontodaten nie bei uns (gehostete Checkout-Seite von Mollie/Stripe → kleinster PCI-Umfang); eigener Dienst für Webhooks, Beleg- und Quittungserzeugung, Aufbewahrung 8–10 Jahre (GoBD), nicht mit Nutzerlöschung vermischt.
- **Nutzerdaten (identity) getrennt vom Rest:** kleinster Kreis mit Zugriff; Export/Löschung laufen darüber.
- **Mail getrennt:** eigener Absender-Ruf (SPF/DKIM/DMARC), Versand nur über `worker`.

## Auslöser (Messgrößen), wann die nächste Stufe fällig ist
Beobachten per Monitoring (Prometheus/Grafana, noch einzurichten); Schwelle 2 Wochen am Stück überschritten:
- CPU > 70 % im Schnitt oder RAM > 80 % (ohne Cache), Swap in Benutzung
- Postgres: Verbindungen > 70 % von `max_connections`, p95-Abfragezeit > 200 ms, Plattenplatz > 70 %
- WebSocket: > 2.000 gleichzeitige Verbindungen oder Chat-Latenz p95 > 500 ms
- API p95 > 400 ms trotz Cache, Fehlerrate > 1 %
- Backup/Restore-Dauer > 30 Minuten
- Rechtlich/Betrieblich: Start echter Zahlungen → Zahlungsdienst isolieren (auch bei wenig Last)

## Server-Größen (Orientierung Hetzner)
- Jetzt: CPX/CX mit 4 GB RAM reicht für Vorschau/Pilot.
- Pilot (wenige tausend Nutzer): 1 Server mit 8 GB RAM / 4 vCPU + Backups.
- Danach zuerst **vertikal** skalieren (größerer Server, wenige Minuten), erst dann horizontal/aufteilen.

## Arbeitsregel
Vor jedem neuen Modul: Bereich festlegen (identity/social/chat/billing), eigenes Schema und eigene DB-Rolle, Prozess/Container bestimmen, Secrets zuordnen. Bei jeder Etappe nennen wir Skalierungsgrenzen und die nächste Trennstufe.

## Umsetzungsstand (2026-10-31)
- **Schemas:** `identity` (users, sessions, consents, audit_log) und `social` (orgs, posts, events, teams, notifications ...) sind getrennt (Migration 0004 verschiebt ohne Datenverlust). `chat` und `billing` folgen mit ihren Modulen.
- **Lesezugriff auf identity:** nur über `UsersDirectory` (Anzeigenamen, Einwilligungen). Ein Test (`db/boundaries.spec.ts`) bricht, wenn social-Module identity-Tabellen importieren.
- **Bekannte Kopplung:** Fremdschlüssel `social.* -> identity.users` (Kaskade bei Kontolöschung). Beim Umzug von identity auf einen eigenen Server entfallen diese Fremdschlüssel; die Löschung läuft dann als Ereignis/Job. `chat` und `billing` bekommen von Anfang an keine Fremdschlüssel auf identity.
- **Worker:** eigener Container (`worker`, gleiches Image) mit BullMQ. Jobs: `sessions.purge` (stündlich), `events.reminders` (10 min), `notifications.insert` (Massen-Fan-out in 500er-Blöcken ab 100 Empfängern).
- **Zwei Redis-Instanzen:** `redis` (Cache/Rate-Limit, allkeys-lru, keine Persistenz) und `redis-queue` (Jobs, noeviction + AOF). BullMQ verlangt noeviction.
- **Noch offen:** DB-Rollen je Bereich (heute ein Datenbanknutzer), `chat`-/`payments`-Container, Monitoring (Prometheus/Grafana).

## Chat (Stand 2026-10-31)
- **Schema `chat`** (conversations, conversation_members, messages, blocks, message_reports): keine Fremdschlüssel auf identity/social; Nutzer-IDs sind einfache UUID-Spalten; Test `boundaries.spec.ts` erzwingt, dass der Chat nur eigene Tabellen kennt.
- **Verschlüsselung (at rest):** je Unterhaltung ein Datenschlüssel, mit Master-Schlüssel (`CHAT_MASTER_KEYS`, Umgebungsvariable) umhüllt; Nachrichten AES-256-GCM mit AAD (Unterhaltung+Nachricht). Rotation: neuen Master-Schlüssel ergänzen, `CHAT_ACTIVE_KEY_VERSION` erhöhen, Job `chat.rewrap-keys` einreihen. **Kein E2EE** (nötig für Meldungen/Auskunft).
- **Container:** `chat-gateway` (WebSocket `/ws`, kennt keine Schlüssel/Inhalte, liest nur Ereignis-IDs von Redis) getrennt von `api` (REST + Ver-/Entschlüsselung) und `worker` (Löschfristen). Bei Server-Umzug: REST-Routen `/api/chat/*` und Schlüssel in den Chat-Container/-Server verlegen.
- **Regeln:** Direktnachrichten nur unter Vereinsmitgliedern oder an den Vorstand gefolgter Vereine; Gruppen nur durch Vorstand/Moderation; Blockieren; 30 Nachrichten/Min je Nutzer; Löschfrist Standard 365 Tage, je Gruppe 1–3650; gemeldete Nachrichten bleiben bis zur Prüfung; Kontolöschung/Auskunft sind eingebunden.
- **Skalierung:** Index (conversation_id, created_at, id) mit Keyset-Paging; ab ~50k Nutzern `messages` nach Monat partitionieren, Chat-DB auf eigenen Server, mehrere Gateways hinter dem Load Balancer (Redis Pub/Sub verteilt). Gateway-Grenzen: 5 Verbindungen je Nutzer.
- **Schlüssel sichern:** Ohne `CHAT_MASTER_KEYS` sind alle Chat-Inhalte unlesbar. Eine Kopie von `/opt/vereine/.env.preview` (nur die Schlüsselzeile) separat und verschlüsselt ablegen; nie ins Repo.

## Profile, Medien, Feed v2 (Stand 2026-10-31)
- **Profile** (`social.profiles`, `user_follows`): Handle (@name), Bio, Ort, Avatar, Sichtbarkeit öffentlich/privat (Folgeanfragen), Vereinsanzeige abschaltbar. Profile entstehen automatisch beim ersten Zugriff. Sichtbarkeitsregeln zentral in `ProfileAccess.canView` (Beiträge, Kommentare, Likes, Bilder prüfen dieselbe Regel).
- **Medien** (`social.media`, `post_media`): Upload per multipart, Typ am Inhalt erkannt (JPEG/PNG/WebP), EXIF/Metadaten entfernt, Neukodierung als WebP (thumb 480, medium 1080, avatar 256/64), Original wird nicht gespeichert; Auslieferung nur nach Anmeldung und Sichtbarkeitsprüfung; Entwürfe nur für den Besitzer; Aufräum-Job nach 24 h; Löschen mit Beitrag/Konto. **Speicher:** Docker-Volume `mediadata` (API + Worker), Backups enthalten es (`backup.sh`). *Skalierung:* ab mehreren App-Servern/großen Mengen Hetzner Object Storage (S3) + CDN – nur `StorageService` ersetzen.
- **Feed v2:** Kandidaten (eigene, Vereine, gefolgte Personen) → Score (Interaktion logarithmisch × Beziehung × Affinität (30 Tage) × Inhalt / Alterung) → Vielfalt (kein Absender mehrfach hintereinander) → Exploration (bis zu 2 Entdecken-Beiträge auf Seite 1). „Weniger davon“: Beitrag ausblenden, Person/Verein stummschalten (nur eigener Feed, einsehbar und rückgängig unter Profil-Einstellungen). Nur mit Einwilligung personalisiert; sonst chronologisch. Grundlage für spätere ML-Version (Ereignis-Erfassung fehlt noch).
