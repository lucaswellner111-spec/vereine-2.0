# B1: Einträge für die Doku (S3 Aktivität und Benachrichtigungen)

Stand: 2026-11-14. Bitte vom Hauptstrang in `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitte 2, 4, 5), `docs/OFFENE-PUNKTE.md`, `docs/ARCHITEKTUR.md` und `CLAUDE.md` übernehmen. Migration: `0031_s3_activity` (Nummern 0029/0030 sind für Paket A2 freigehalten; Journal-Eintrag `idx: 31`).

## 1. DATENSCHUTZ-LAUNCH.md, Abschnitt 2 (Verarbeitungsübersicht)

| Verarbeitung | Daten | Rechtsgrundlage | Ort | Frist |
|---|---|---|---|---|
| Kommentar-Antworten *(S3)* | `social.comments.parent_id` (eine Ebene); Text wie ein Kommentar | Vertrag (Art. 6 Abs. 1 lit. b, Nutzung der Plattform) | `social.comments` | wie Kommentare: mit dem Beitrag (30 Tage nach Löschen, dann Kaskade); Antworten verschwinden mit dem Elternkommentar; mit dem Konto gelöscht |
| Kommentar-Likes *(S3)* | Kommentar-ID, Nutzer-ID, Zeitpunkt | lit. b | `social.comment_likes` (FK Kaskade auf Kommentar und Nutzer) | mit Kommentar/Beitrag oder Konto; in der Datenauskunft (`commentLikes`) |
| Benachrichtigungen: Likes gebündelt, Antwort, Erwähnung *(S3)* | je Empfänger: Art, Beitrags-/Kommentar-ID, bei Antwort/Erwähnung Textauszug (80 Zeichen), auslösende Person als `actor_id` (Einzelfälle) bzw. `actor_ids` (höchstens 3 Personen) plus `actor_count`; bei Likes je Ziel/Typ/Tag eine Zeile (`group_key`). Namen, Handles und Avatare werden erst beim Lesen aus dem Verzeichnis aufgelöst und nicht gespeichert | lit. b (Funktion der Plattform) | `social.notifications` | 180 Tage (wie alle Benachrichtigungen, Job `privacy.retention`); Likes-Zeile verschwindet, wenn der letzte Like zurückgenommen wird |
| @Erwähnungen *(S3)* | Benutzername im Text (Beitrag/Kommentar, öffentlich wie der Text selbst); Benachrichtigung nur an Personen, die den Beitrag sehen dürfen und nicht mit dem Auslöser blockiert sind | lit. b | Text in `posts`/`comments`; Benachrichtigung in `social.notifications` | wie Beitrag bzw. Benachrichtigung |
| Live-Zustellung *(S3)* | Redis-Ereignis `{type:"notification", id}` (nur die Benachrichtigungs-ID, kein Name, kein Text); Inhalt holt der Client per REST (`GET /notifications/:id`, nur für den Empfänger) | lit. b | Redis Pub/Sub (flüchtig, nicht gespeichert) → `chat-gateway` → Browser des Empfängers | flüchtig (Sekunden) |
| „Meine Likes/Kommentare“ *(S3)* | keine neue Speicherung: `GET /me/likes`, `GET /me/comments` lesen die eigenen Datensätze (Beitragsvorschau nur für sichtbare Beiträge) | lit. b | – | – |
| Like-Liste *(S3)* | `GET /posts/:id/likes`: Name, Benutzername, Avatar der Person, die geliked hat; nur Personen, deren Profil der Betrachter sehen darf (private Profile bleiben verborgen, die Gesamtzahl war schon öffentlich) | lit. b | – | – |

Datenauskunft: `notifications[]` enthält zusätzlich `actorIds` und `actorCount`, Export-Felder je Typ in `EXPORT_KEYS` (`like`: `postId`; `comment_like`, `comment_reply`, `mention`: `postId`, `commentId`; Textauszüge und Namen anderer Personen werden nicht ausgegeben). `commentLikes[]` und bei `comments[]` das Feld `replyTo`.

## 2. Abschnitt 4/5 (Austritt, Kontolöschung)

- Konto löschen: eigene Kommentar-Likes und Antworten gehen per Kaskade; `notifications.eraseUser` entfernt die Person aus den gebündelten Likes anderer (Zähler minus 1, leere Zeilen werden gelöscht), Einzelbenachrichtigungen mit `actor_id` fallen wie bisher per Kaskade weg.
- Blockierung (Chat-Sperre) gilt bei allen neuen Benachrichtigungen in beide Richtungen: Likes, Kommentar-Likes, Antworten und Erwähnungen erzeugen dann keine Benachrichtigung; blockierte Personen zählen auch nicht in gebündelten Likes mit.
- Sichtbarkeit: Erwähnungen, Antworten und Kommentar-Likes lösen nur aus, wenn der Empfänger den Beitrag sehen darf (persönliche Beiträge privater Profile: nur bestätigte Follower). Damit erfährt niemand über eine Benachrichtigung vom Inhalt eines Beitrags, den er nicht sehen darf, und der Auslöser erfährt nicht, ob jemand benachrichtigt wurde.
- Web-Push für Likes ist aus (zu laut); Antwort und Erwähnung nutzen Web-Push mit generischem Text („Jemand hat auf deinen Kommentar geantwortet“, ohne Namen und Inhalt).

## 3. OFFENE-PUNKTE.md

- **Live-Banner ist eine zeitlich begrenzte Einblendung (4 s).** Für WCAG 2.2.1 bleibt der Inhalt dauerhaft in `/aktivitaet`; das Banner pausiert bei Zeiger und Fokus und hat einen Schließen-Knopf. Falls die Prüfung „Timing anpassbar“ strenger ausgelegt wird: Einstellung „Banner aus“ ergänzen.
- **Banner für Chat-Nachrichten** nutzt die Unterhaltungsliste (`GET /chat/conversations`, Vorschau vom Server entschlüsselt) statt eines Inhalts im Ereignis; je Nachricht ein zusätzlicher Abruf, solange die Unterhaltung nicht offen ist. Bei sehr vielen Nutzern drosseln oder Vorschau ins Ereignis geben (dann Inhalt über Redis, bewusst vermieden).
- **Gebündelte Likes zählen je Kalendertag (UTC).** Ein Like von gestern, das heute zurückgenommen wird, ändert die Zeile von gestern nicht (stale Zähler, nur Anzeige). Auf Wunsch beim Rücknehmen alle Gruppenzeilen des Ziels angleichen.
- **E-Mail-Sammelmail:** neue Typen (Like, Kommentar-Like, Antwort, Erwähnung) bleiben bewusst draußen (`digestLines` kennt nur die Liste in `LABELS`; keine Mails für Likes). Falls Antworten/Erwähnungen in der Tagesmail erscheinen sollen, Einträge ergänzen.
- **Mentions in bearbeiteten Beiträgen** (`PATCH /posts/:id`) lösen keine Benachrichtigung aus (nur beim Erstellen), um Spam durch Bearbeiten zu verhindern.
- **Kommentare:** weiterhin höchstens 200 je Beitrag in der Liste (Antworten, die hinter dieser Grenze liegen, erscheinen als eigene Kommentare).
- **Rate-Limits (neu):** Likes und Kommentar-Likes 600/h je Person (gemeinsamer Zähler `like:toggle`), Kommentare/Antworten weiter 100/h (`comment:create`). Lesen (`/me/likes`, `/me/comments`, Like-Liste) ohne eigenes Limit, Keyset-Paging, Seitengröße 20/30.

## 4. ARCHITEKTUR.md / CLAUDE.md

- Neues Modul `chat/realtime.module.ts` (`RealtimeModule`) stellt `REALTIME_BUS` bereit; `ChatModule` und `NotificationsModule` importieren es (der Bus gehört nicht mehr dem Chat). Tests überschreiben weiter `REALTIME_BUS`.
- `ChatEvent` hat den Fall `{ type: "notification"; id }`. Der Web-Client (`NotificationHubProvider` in `components/notification-hub.tsx`, innerhalb von `ChatProvider`) hält Zähler und Banner; Polling gibt es nur als Rückfall des `ChatProvider` bei getrenntem Socket (Ereignis `poll`).
- `posts/activity.service.ts` (`ActivityService`): Sichtbarkeits-/Blockregel für Benachrichtigungen (`canNotify`), Like-Bündelung (`syncPostLike`, `syncCommentLike` → `NotificationsService.syncLikeGroup`), Erwähnungen (`notifyMentions`, `parseMentions`), Like-Liste, `me/likes`, `me/comments`.
- Neue Endpunkte: `GET /posts/:id/likes`, `POST /comments/:id/like`, `GET /me/likes`, `GET /me/comments`, `GET /notifications/:id`, `DELETE /notifications/:id`; `POST /posts/:id/comments` nimmt `parentId`.
- Seite `/aktivitaet` (Tabs Benachrichtigungen/Gefällt mir/Kommentare); `/benachrichtigungen` leitet dorthin um.
- E2E-Hinweis: Im E2E-Aufbau (Web-Port ungleich 3000) erreicht der WebSocket das Gateway nicht (kein `/ws`-Proxy in Next); das Banner ist deshalb per Vitest (Komponente) und der Bus-/Gateway-Pfad per API-Test (`ws.spec.ts`) abgedeckt, die E2E-Prüfung von `/aktivitaet` läuft ohne Live-Banner.
