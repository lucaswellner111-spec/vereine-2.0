# Paket A4: Elternkonto und Jugendkonto (Konzept)

Stand: 2026-11-14, Branch `vor-gruendung`. Nur Konzept, kein Code. Grundlage ist die Entscheidung des Gründers: **Eltern haben ein Konto; unter 16-Jährige bekommen ein Unterkonto („Jugendkonto“) unter dem Elternkonto mit eingeschränktem Funktionsumfang.** Das ersetzt die Optionen 2 und 3 aus `docs/recht/FRAGENLISTE-ANWALT-DSB.md` A3 und löst den Punkt „Mindestalter 16 vs. Jugendvereine“ aus `docs/OFFENE-PUNKTE.md` (Zeile 60) und `docs/DATENSCHUTZ-LAUNCH.md` Abschnitt 4. Rechtliche Aussagen sind Arbeitsannahmen und gehen zur Prüfung an Anwalt/DSB (siehe 3.6).

Leitgedanke: **Sicher von Anfang an (default deny).** Ein Jugendkonto darf nur, was ausdrücklich in einer Positivliste steht. Neue Endpunkte sind für Jugendkonten automatisch gesperrt.

---

## 1. Datenmodell

### 1.1 Ausgangslage im Code
- `identity.users` (`apps/api/src/db/schema.ts`): E-Mail (not null, unique), Passwort-Hash, Anzeigename, `platformRole`. Kein Alter, kein Konto-Typ. Registrierung verlangt nur `confirmAge16: true` (`packages/shared/src/index.ts` Zeile 36), es wird nichts gespeichert.
- `members.member_profiles`: `birthDate`, `guardianName`, `guardianEmail` (Vereinsdaten, werden beim Austritt geleert, `MembersService.anonymizeOnLeave`). `guardianName/-Email` werden nirgends genutzt.
- `social.org_members` (Rolle admin/treasurer/moderator/member, Status pending/active). `billing.invoices` hat Empfänger-ID plus Namenskopie ohne Fremdschlüssel.
- Rolle „Trainer“ gibt es nicht; Trainer sind faktisch `moderator` (Anwesenheit, Termine, Moderation).

### 1.2 Konto-Typen
| Typ | `identity.users.account_type` | Login | Beschreibung |
|---|---|---|---|
| Erwachsenenkonto (auch Eltern) | `adult` (Standard, alle Bestandskonten) | E-Mail + Passwort | Wie heute. Mindestalter 16 (Selbstangabe), kein Geburtsdatum nötig. |
| Jugendkonto | `youth` | Etappe 1: keines (nur Eltern verwalten). Ab Etappe 3: Benutzername (`@handle`) + eigenes Passwort | Unter 16. Immer mindestens ein aktives Elternkonto verknüpft. |

Es gibt **keine** dritte Stufe „16–17“: ab dem 16. Geburtstag ist das Konto ein normales `adult`-Konto (Entscheidung des Gründers, deckt sich mit Art. 8 Abs. 1 DSGVO / Deutschland: Einwilligung ab 16).

Ein Jugendkonto bekommt eine normale `identity.users`-Zeile (dieselbe `id` wie später als Erwachsener, siehe 1.6). Damit funktionieren Mitgliedschaft, Zusagen, Chat-Mitgliedschaft, Rechnungsbezug ohne Umbau der Fremd-UUIDs in `chat`, `billing`, `members`. Pflichtfelder von `users` werden so belegt:
- `email`: interne Platzhalteradresse `youth+<uuid>@konto.invalid` (reservierte TLD, kein Mailversand; `MailService` und Sperrliste ignorieren `*.invalid`). Das erhält `unique/not null` und vermeidet einen Umbau aller Stellen, die `users.email` lesen.
- `passwordHash`: Etappe 1 Sentinel-Wert „kein Login“ (kein gültiger argon2-Hash, `verify` schlägt immer fehl); ab Etappe 3 das vom Elternteil gesetzte/bestätigte Passwort des Kindes.
- `displayName`: Vorname + Initiale („Lena K.“), nie der volle Nachname (Namenspolitik 2.3).
- `emailVerifiedAt`: gesetzt (nichts zu bestätigen); `pendingVerification=false`.

### 1.3 Neue Tabellen (Schema `identity`, Migration „nächste freie Nummer“, heute 0029)
1. **`identity.users`**: neue Spalte `account_type text not null default 'adult' check in ('adult','youth')`, Index auf `account_type` (nur für Jobs).
2. **`identity.youth_profiles`** (1:1 zu Jugendkonto): `user_id` PK/FK users (Kaskade), `birth_date date not null`, `login_enabled boolean not null default false`, `graduation_due_on date not null` (= Geburtstag + 16 Jahre, bei der Anlage berechnet), `graduation_started_at`, `created_by` (Elternteil-ID, ohne Kaskade, leer nach Löschung). Das Geburtsdatum liegt bewusst im **Identity-Bereich** und nicht nur in `members.member_profiles`: Die Plattform braucht es für die Altersgrenze, der Verein behält sein eigenes optionales Feld (wird beim Austritt geleert, die Plattformgrenze bleibt davon unberührt). Alternative „nur Geburtsmonat/-jahr“ wurde verworfen, weil der 16. Geburtstag taggenau gelten muss.
3. **`identity.guardianships`** (Eltern-Kind-Beziehung, n:m): `id`, `guardian_user_id` (FK users, Kaskade), `youth_user_id` (FK users, Kaskade), `status` (`pending` | `active` | `ended`), `is_billing_contact boolean`, `scope` (`full` | `billing_only`, letzteres nur für den Sonderfall 16–17, siehe 1.6), `created_at`, `confirmed_at`, `ended_at`, `end_reason` (`age16` | `guardian_left` | `revoked` | `youth_deleted`). Eindeutig `(guardian_user_id, youth_user_id)`; partieller Unique-Index: je Kind genau **ein** aktiver Rechnungsempfänger (`where status='active' and is_billing_contact`); Check `guardian_user_id <> youth_user_id`; höchstens 4 aktive Elternteile je Kind (Dienst-Limit); der Elternteil muss `account_type='adult'` sein (Dienst + Test, nicht nur Constraint).
4. **`identity.guardian_invites`** (zweiter Elternteil): `token_hash` PK (SHA-256, Token nur im Link-Fragment wie `auth_tokens`), `youth_user_id`, `invited_by`, `expires_at` (7 Tage), `used_at`. **Keine E-Mail-Adresse des Eingeladenen gespeichert** (Versand über `MailService.send`, Vorlage `guardian-invite`, Adresse nur im Job). Aufräumen in `purgeExpired` (7 Tage nach Ablauf/Nutzung).
5. **`identity.guardian_consents`** (Nachweis, **append-only**, Muster `avv.acceptances` mit Trigger „nur INSERT“): `id`, `youth_user_id`, `guardian_user_id` (Verweis ohne FK, wird bei Löschung des Elternteils per einziger erlaubter Änderung auf NULL gesetzt), `purpose` (siehe 3.1), `org_id` nullable, `granted boolean`, `text_version`, `text_hash`, `created_at`. Aktueller Stand einer Freigabe = letzter Eintrag je `(youth_user_id, purpose, org_id)`. Keine IP-Adresse, kein User-Agent.

Warum nicht die bestehende Tabelle `identity.consents`? Dort ist `user_id` der Einwilligende und Kaskade-gelöscht. Hier ist der Einwilligende der Elternteil und der Betroffene das Kind; Nachweise müssen die Löschung eines der beiden überstehen können (3.3).

### 1.4 Mehrere Eltern, Kinder in mehreren Vereinen
- **Mehrere Eltern**: Der erste Elternteil legt das Kind an (Selbstauskunft „Ich bin sorgeberechtigt“, versioniert in `guardian_consents`, Zweck `account`). Weitere Elternteile (Partner, geschiedene Elternteile, Großeltern mit Sorgerecht ist unüblich) werden per Einladungslink (`guardian_invites`) angebunden und müssen ihr eigenes Erwachsenenkonto haben und die Selbstauskunft ebenfalls abgeben. Alle aktiven Elternteile sind gleichberechtigt sichtbar; **Regel für Konflikte: restriktiv gewinnt.** Jeder Elternteil kann eine Freigabe widerrufen und das Jugendkonto sperren; Freigaben erweitern nur, wenn **mindestens ein** Elternteil zustimmt und **kein** anderer aktiver Elternteil widersprochen hat (letzter Eintrag je Elternteil, `granted=false` blockiert). Sorgerechtsstreit entscheidet die Plattform nicht: bei Widerspruch bleibt das Konto im eingeschränkten Zustand, Hinweis auf Klärung zwischen den Eltern; Eskalation über Support (Betreiber sperrt/löscht auf nachvollziehbare Aufforderung beider).
- **Rechnungsempfänger** genau ein Elternteil je Kind (`is_billing_contact`), wechselbar durch jeden Elternteil mit Bestätigung des bisherigen Empfängers nicht nötig (Verein ist nicht betroffen, nur die Adressierung künftiger Rechnungen).
- **Kinder in mehreren Vereinen**: Es gibt **ein** Jugendkonto je Kind, mehrere `social.org_members`-Zeilen (wie bei Erwachsenen). Jede **Vereinsmitgliedschaft** braucht eine eigene Elternfreigabe (`purpose='org_membership'`, `org_id`), ebenso vereinsbezogene Freigaben (Kommentare etc.). Ein Elternkonto kann mehrere Kinder haben (Geschwister): Übersicht „Meine Kinder“, Familien-Einstellungen können pro Kind gesetzt werden.
- Ein Kind kann nie selbst Mitglied werden: `POST invites/:token/accept` (`orgs/org-admin.controller.ts`) und `OrgsService.requestJoin` (Mitgliedsanträge) lehnen Jugendkonten ab (403, „Das macht dein Elternteil für dich“); die Annahme erfolgt durch den Elternteil „für mein Kind“.

### 1.5 Alter aus Geburtsdatum
- Zentrale Funktion `ageOn(birthDate, today)` in `apps/api/src/common/age.ts` (Datum nach deutscher Zeit, `common/berlin-date.ts`). Der 16. Geburtstag gilt ab 00:00 Uhr deutscher Zeit am Geburtstag.
- **Nie** das Alter speichern; gespeichert wird nur `birth_date` und die daraus abgeleitete `graduation_due_on` (für den Job-Index).
- Konstante `YOUTH_AGE_LIMIT = 16` in `packages/shared` (Web zeigt Texte, API erzwingt).
- Das Mindestalter für Erwachsenenkonten bleibt Selbstangabe (`confirmAge16`). Anlage eines Jugendkontos verlangt Geburtsdatum, Alter muss **unter 16 und mindestens 6** sein (Untergrenze Missbrauchsschutz, Wert offen).
- Registrierung: `confirmAge16` bleibt; der Hinweistext verweist neu auf „Für Kinder unter 16: Elternkonto anlegen und Kind hinzufügen“.

### 1.6 Übergang ab 16: Jugendkonto wird eigenes Konto
Täglicher Job `youth.graduation` (Muster `JobsService.every`, in `auth`): findet `youth_profiles` mit `graduation_due_on <= heute` und `graduation_started_at is null`.
1. **Vorlauf (30 und 7 Tage vorher)**: Benachrichtigung/Mail an alle Elternteile („X wird am … 16 und bekommt ein eigenes Konto“) und im Jugendkonto selbst, sofern Login besteht.
2. **Am Stichtag**: `graduation_started_at` setzen. Das Konto wird **gesperrt für inhaltliche Funktionen** (Status „Konto übernehmen“) und alle Sitzungen beendet. Elternrechte auf **Inhalte** enden sofort (kein Mitlesen im Chat, keine Einblicke ins Profil), siehe unten.
3. **Übernahme durch den Jugendlichen**: Er öffnet einen Aktivierungslink (nur per Elternteil weitergegeben oder per Wechsel „E-Mail hinterlegt“): setzt **eigene E-Mail** (Bestätigung per Link, Muster `email-flows.service.ts` Flow `verify`), **eigenes Passwort**, akzeptiert Nutzungsbedingungen/Datenschutz und bestätigt `confirmAge16` selbst, trifft seine eigenen Einwilligungen neu (Personalisierung, Sammelmail, Push). Dann: `account_type='adult'`, `email` = neue Adresse, `passwordHash` neu, `youth_profiles` bleibt als Archivzeile **nicht** erhalten (Geburtsdatum wird gelöscht, siehe Datenübernahme), `guardianships.status='ended'` (`end_reason='age16'`).
4. **Datenübernahme (gleiche `users.id`, keine Kopie)**: Beiträge, Kommentare, Likes, Chats, Zusagen, Mitgliedschaften, Mitgliedsnummern, Folgen und Profil bleiben. Zurückgesetzt/neu: Einwilligungen (Eltern-Einwilligungen gelten nicht fort, neue eigene), Push-Abos (Geräte neu bestätigen), Profil-Sichtbarkeit bleibt „privat“ bis zur eigenen Änderung, Feed-Personalisierung aus. Elternfreigaben (`guardian_consents`) bleiben als Nachweis erhalten (3.3). Eltern-Mitleser in Gruppenchats werden entfernt (`ChatService.leaveConversation` je Eltern-Beobachter). Familien-Gerätezuordnung entfällt.
5. **Rechnungen 16–17**: Mit 16 ist der Jugendliche beschränkt geschäftsfähig, Beitragspflicht gegenüber dem Verein folgt aus der Mitgliedschaft (Eltern hatten Beitritt zugestimmt, § 107 BGB; Rechtsfrage). Praktisch zahlen Eltern oft weiter. Daher Familienoption: Elternteil bleibt als `billing_only` verknüpft (`guardianships.scope='billing_only'`, endet mit dem 18. Geburtstag, nur Rechnungen, keine Einblicke), sofern Jugendlicher und Elternteil zustimmen. Sonst Empfänger = Jugendlicher ab dem nächsten Beitragslauf.
6. **Keine Übernahme innerhalb 90 Tagen**: Konto ruht („pausiert“, Login nicht möglich; Mitgliedschaft im Verein und Rechnungsdaten bleiben unverändert). Nach 12 Monaten ohne Übernahme: Löschung des Plattformkontos (außer Pflichtaufbewahrung Rechnungen, wie heute bei Kontolöschung). Fristen sind Vorschläge.
7. **Beitragsklasse**: Der Vorstand bekommt eine Aufgabe/Hinweis „X wurde 16, Beitragsklasse prüfen“ (kein Automatismus, es geht um Geld).
8. **Ohne eigenen Login (Etappe 1)**: Bis ein Kind Zugriff hat, läuft derselbe Job, aber Elternhinweis lautet „Dein Kind wird 16: es braucht dann ein eigenes Konto mit eigener E-Mail“.

---

## 2. Rechtekatalog Jugendkonto

Prinzipien: (1) Default deny, Positivliste. (2) Jede Erweiterung braucht eine ausdrückliche Elternfreigabe, die jederzeit widerrufbar ist (Nachweis 3.1). (3) Keine Kontaktaufnahme Fremder: Jugendkonten sind nicht auffindbar und nicht anschreibbar. (4) Kein Profiling: chronologischer Feed. (5) Ruhezeit: keine Push-Nachrichten 21–7 Uhr. (6) Zentrale Durchsetzung statt Verstreuung (siehe 5.1).

### 2.1 Katalog

| Funktion | Voreinstellung Jugendkonto | Elternfreigabe | Begründung und Umsetzung |
|---|---|---|---|
| **Feed lesen** | **An, aber nur Vereinsbeiträge der eigenen Vereine** (Mitgliedschaft aktiv und freigegeben), **chronologisch**, keine „Entdecken“-Beiträge, keine Beiträge einzelner Personen | nein (Teil der Vereinsfreigabe) | Kernnutzen im Verein. Kein Profiling/Empfehlungssystem bei Minderjährigen (DSB-Prüfpunkt, vgl. DSA Art. 28). `PostsService.feed` bekommt einen Jugend-Pfad ohne Ranking (`feed/ranking.ts` wird nicht aufgerufen, keine Exploration, keine Ereignis-Erfassung). Beiträge mit Kontaktdaten Dritter sind in Vereinsbeiträgen Sache des Vereins. |
| **Beitrag posten** | **Aus** | Nur Vereinsbeiträge, nur nach Vorab-Freigabe durch Vorstand/Moderation (Warteschlange), **Etappe 5, empfohlen: dauerhaft aus** | Größtes Risiko (Selbstdarstellung, Fotos, Kontaktdaten), geringster Nutzen im Verein. Beiträge der Kinder laufen über Trainer/Vorstand. Persönliche Beiträge (ohne Verein) nie. |
| **Kommentare schreiben** | **Aus** | Elternfreigabe je Verein (`purpose='comments'`), nur unter Vereinsbeiträgen. Kommentare unterliegen einem Kontaktdaten-Filter (E-Mail, Telefonnummer, Links, @Nennung anderer Jugendlicher werden abgelehnt), Länge max. 280 Zeichen, 20/Stunde | Kommunikation vor Fremden, aber moderierbar und im Verein sichtbar. Moderation sieht Badge „Jugendkonto“. |
| **Kommentare lesen** | An (Teil des Feeds) | nein | Lesen ohne Beteiligung ist unkritisch. |
| **Likes** | **An** (nur Vereinsbeiträge) | nein | Geringes Risiko, kein Freitext, wichtig für Bindung. Likes bleiben in der Auskunft; sie speisen nur die Beitragszähler (kein Ranking, siehe Feed). |
| **Direktnachricht (1:1)** | **Aus**, Jugendkonten sind für Erwachsene nie direkt anschreibbar (auch nicht für Trainer/Vorstand) | Nur **Jugend ↔ Jugend** im selben Verein und gleichen Team, beide Elternteile geben frei (`purpose='dm_peer'`, je Kind und Person) | Schutz vor Grooming/Kontaktaufnahme durch Erwachsene (JMStV-Prüfpunkt, Fragenliste A3). `ChatService.createDirect` und `OrgsService.canContact` bekommen die Regel; Vorstand kontaktiert **Eltern**, nicht Kinder. |
| **Gruppenchats** (Team-Chat) | **Aus** | Elternfreigabe je Gruppe/Team (`purpose='chat_group'`); nur Gruppen mit **mindestens zwei Erwachsenen** (Vier-Augen-Prinzip: Trainer + zweiter Erwachsener) **und Eltern als lesende Mitglieder** („Eltern lesen mit“, Rolle `guardian_viewer`, schreibgeschützt) | Aus `docs/RESEARCH-MARKT-UND-UI.md` Punkt 16. Gruppen entstehen nur durch Vorstand/Moderation (vorhanden, `createGroup`). Ein Jugendkonto kann keine Gruppen anlegen und nicht einladen. Hinweis im Chat-Kopf „Eltern lesen mit“ (Transparenz gegenüber allen Mitgliedern, vor dem Beitritt). Rechtsfrage 3.6 (Mitlesen vs. Persönlichkeitsrechte der Kinder). |
| **Termine sehen/Zusagen** | **An** (Vereinstermine, Teamtermine, interne Termine des eigenen Vereins) | Zu-/Absage durch Kind selbst **und** durch jeden Elternteil für das Kind; Eltern werden bei Zusage/Absage benachrichtigt, jede Änderung ist im Protokoll nachvollziehbar | Zentrale Funktion im Jugendsport. Elternzusagen sind faktisch wichtiger als die des Kindes. Wartelisten funktionieren unverändert. Name in Teilnehmerlisten für andere Mitglieder nur „Vorname + Initiale“; Vorstand/Trainer sehen den vollen Namen. |
| **Helferlisten** (`events/shifts.service.ts`) | **Eintragen aus** | Eltern tragen sich selbst ein; Eintragung des Kindes nur durch Elternteil (`purpose='shifts'` je Verein) | Aufsichts- und Haftungsfragen (Helferdienste sind oft Aufsichtspflicht). Kinder sehen die Liste ohne Namen anderer Kinder. |
| **Profil** | Immer **privat**, kein Freitext (Bio/Ort gesperrt), Handle generiert („lena-k-4821“, keine Klarnamen), Vereinsanzeige an | Profilbild: Elternfreigabe (`purpose='avatar'`). Bio/Ort nie | `ProfileAccess.canView` bekommt Jugend-Regel: sichtbar nur für Mitglieder derselben Vereine (nicht für Fremde, nicht über Folgen). `PUT /profiles/me` filtert Felder. |
| **Suche** (Personen, Befehlspalette) | Jugendkonten sind **nirgends auffindbar** (`/profiles/search`, Chat-Kandidaten, Mitglieder-hinzufügen-Liste außer für Vorstand/Moderation) und suchen selbst nur Vereine (eigene) | nein | Verhindert Kontaktaufnahme Fremder. Finder `vereine-finden` ohne Login unverändert (keine Personen). |
| **Folgen** | Darf **nur eigenen Vereinen folgen** (Mitgliedschaft); **keine Person folgen**, **niemand kann dem Jugendkonto folgen** (keine Folgeanfragen) | nein | Folgenetze sind Reichweitenmaschine und Kontaktweg. |
| **Push-Benachrichtigungen** | **Aus** | Elternfreigabe (`purpose='push'`); dann nur Kurztexte (wie heute), Ruhezeit 21–7 Uhr, keine Chat-Push ohne zusätzliche Chat-Freigabe | Push ist heute schon inhaltsarm (`ARCHITEKTUR.md`). Ruhezeit = Jugendschutz. Web-Push kann Elternteil auch auf dem Gerät des Kindes nicht „einstellen“, nur über Kontoeinstellungen entziehen. |
| **E-Mail-Sammelmail** | **Aus**, nie an das Kind | Optional an **Elternteil** (neue Art „Familienübersicht“) | Platzhalteradresse hat keinen Postkorb. |
| **Foto-/Bild-Upload** | **Aus** (kein Profilbild, kein Beitragsbild, kein Chat-Bild) | Nur Avatar mit Freigabe; Fotos in Chats nie (Chat kennt ohnehin nur Text) | `MediaService` (Typ am Inhalt, EXIF entfernt) bleibt; neue Gate-Prüfung beim Upload. Bildrechte an Fotos **von** Kindern in Vereinsbeiträgen: eigener Einwilligungszweck für Eltern (`purpose='photo_publication'`, je Verein, Etappe 4), Trainer sehen Warnhinweis beim Hochladen („Kinder im Bild?“), Vereinsverantwortung nach KUG. |
| **Öffentliche Sichtbarkeit** | **Nie**: Jugendkonto, Name, Handle, Beiträge, Kommentare, Zusagen, Mitgliedschaft erscheinen weder auf `/public/*` noch in Suchmaschinen; Mitgliederzahl im Verein zählt Kinder mit (reine Zahl) | nein | `PublicModule` liefert ohnehin keine Personen, wird per Test abgesichert. |
| **Melden/Blockieren** | **An** | nein | Schutzfunktion. Melden aus Jugendkonto geht an Moderation und Plattform, **nicht** automatisch an die Eltern (Vertrauensschutz; Entscheidung offen). |
| **Umfragen abstimmen** | An (Vereinsumfragen) | nein | Stimmen sind anonym gezählt. Umfrage-Themen unterliegen den Community-Richtlinien. |
| **Kalender-Abo (ICS)** | **Aus** | Elternteil kann das Abo für das Kind einrichten (läuft über das **Elternkonto**: Termine des Kindes im Elternkalender) | Geheimer Link wäre ein ungeschützter Zugang. |
| **2FA** | Nicht vorgesehen für Jugendkonten | — | Schutz läuft über das Elternkonto (2FA dort empfohlen). |
| **Vereinsfunktionen** (gründen, einladen, Rollen) | **Aus**, Rolle nur `member` | nein | `OrgsService.setRole` lehnt Rollen über `member` für Jugendkonten ab; keine Vereinsgründung, keine Einladungslinks. |
| **Datenexport/Löschung** | Kind selbst: nein; Eltern: ja | — | siehe 2.4. |

### 2.2 Strengere Voreinstellungen (Zusammenfassung)
Profil privat und gesperrt für Fremde; kein Freitext; Pseudonym-Handle; keine Personalisierung; keine Push; keine DMs; keine Uploads; Ruhezeit 21–7; Kommentare und Chat nur freigabepflichtig; Konto nur lesend nutzbar, bis Eltern etwas freigeben. Eltern können **nichts über das gesetzliche Maß hinaus** erweitern: die Sperren „Erwachsene schreiben Jugendkonten nie 1:1“, „nie öffentlich“, „nie auffindbar“ sind **nicht** durch Freigabe aufhebbar (Plattformgrenzen, Konstanten in `common/youth-policy.ts`).

### 2.3 Namenspolitik
Anzeigename Jugendkonto: Vorname + Initiale. Vorstand/Moderation des Vereins sehen den Klarnamen in Mitgliederliste und Anwesenheit (Vereinsdaten, `members.member_profiles` über Vereinsmitgliedschaft; dort gibt der Elternteil den vollen Namen an den Verein, nicht an die Plattformöffentlichkeit). `UsersDirectory.names` liefert für Jugendkonten standardmäßig den gekürzten Namen; ein zusätzlicher Parameter `{ full: true }` ist nur für berechtigte Dienste (Mitgliederverwaltung, Anwesenheit, Billing) vorgesehen und wird im Test abgedeckt.

### 2.4 Elternübersicht und Löschrechte
**Elternübersicht** („Meine Kinder“, `/einstellungen/kinder` und `/kinder/[id]`), nur für aktive Elternteile mit `scope='full'`:
- Kinderliste, je Kind: Vereine/Mitgliedschaft, nächste Termine, Zu-/Absagen (Eltern können ändern), Anwesenheitsquote und -liste des Kindes, Rechnungen (soweit Rechnungsempfänger), aktuelle Freigaben mit einem Schalter je Zweck und Verein, Protokoll „Was hat mein Kind gemacht“ (Kommentare, Chatgruppen-Beitritte, Anmeldungen; **ohne Chat-Inhalte im Konto**, Chat-Inhalte nur über „Mitlesen“ in den Gruppen).
- Aktionen: Konto sperren/entsperren (Notbremse, alle Sitzungen beenden), Passwort des Kindes zurücksetzen, Benutzername ändern, Freigaben widerrufen, zweiten Elternteil einladen, Rechnungsempfänger wechseln, Verein verlassen lassen, **Jugendkonto löschen**.
- Kein „Als Kind anmelden“ (Impersonation vermeiden; Elternzugriff läuft über eigene Oberfläche).

**Löschrechte:**
- Jeder aktive Elternteil kann jederzeit Freigaben widerrufen, das Kind aus einem Verein austreten lassen, das Jugendkonto sperren.
- **Löschung des Jugendkontos** durch einen Elternteil: Passwortbestätigung des Elternteils; dann gelten dieselben Schritte wie `PrivacyService` heute (Konto sperren, `exportFor/eraseUser` aller Dienste, Rechnungen anonymisiert). Hat das Kind **weitere** Elternteile, wird diesen die Löschung 7 Tage vorher angekündigt (Widerspruchsmöglichkeit; restriktive Regel gilt für Freigaben, für Löschungen setzt das Gegenteil: „Löschen“ wird bei Konflikt **verzögert**, nicht verhindert, weil es der datenschutzfreundliche Weg ist; Rechtsfrage).
- **Löscht ein Elternteil sein Konto**: die Verknüpfung endet (`end_reason='guardian_left'`). Ist er der letzte aktive Elternteil: Jugendkonto wird **gesperrt**, alle Eltern-Funktionen entfallen; nach **30 Tagen** Löschung des Jugendkontos, außer ein neuer Elternteil nimmt es per Support-Verfahren an (Einladungslink eines Vorstands-Verifizierungsweges, Etappe 4). Vorstände werden informiert, dass die Mitgliedschaft ruht. Die Elternkonto-Löschung wird ohnehin abgelehnt, wenn der Elternteil **einziger Vorstand** ist (bestehende Regel, Abschnitt 4 `DATENSCHUTZ-LAUNCH.md`); zusätzlich Warnhinweis „Dein Kind verliert sein Konto“ (Bestätigungsdialog `ask()`).
- Das **Kind** darf (ab Etappe 3) sein Konto nicht selbst löschen, kann aber „Lösche mein Konto“ als Anfrage an die Eltern senden (Benachrichtigung).

---

## 3. Datenschutz

### 3.1 Einwilligung der Eltern
Rechtsgrundlagen (zur Prüfung): Für Plattformnutzung durch unter 16-Jährige, soweit auf Einwilligung gestützt (z. B. Personalisierung, Push, Profilbild): **Art. 8 Abs. 1 DSGVO** (Einwilligung/Zustimmung der Träger der elterlichen Verantwortung). Für Mitgliedschaft und Beitrag im Verein: **Vertrag des Vereins** (Art. 6 Abs. 1 lit. b, Minderjährige beschränkt geschäftsfähig, Eltern stimmen Beitritt zu, §§ 107, 108 BGB), Plattform als Auftragsverarbeiter (AVV). Die Plattform-Einwilligung der Eltern ist deshalb **Zweck-/Freigabe-bezogen** und nicht pauschal.

Zwecke in `guardian_consents.purpose`: `account` (Anlage des Jugendkontos, Selbstauskunft Sorgeberechtigung, Datenschutzhinweise gelesen), `org_membership` (je Verein), `comments`, `chat_group`, `dm_peer`, `push`, `avatar`, `shifts`, `photo_publication`. Jeder Eintrag trägt `text_version` + `text_hash` des angezeigten Einwilligungstextes (Texte in `packages/shared/src/youth-consent.ts`, Konstante `YOUTH_CONSENT_VERSION` analog `WAITLIST_CONSENT_VERSION`).

**Verifikation der Elternschaft (Verhältnismäßigkeit):** keine Ausweiskopie. Erwachsenenkonto mit bestätigter E-Mail + Selbstauskunft + Double-Opt-in-Mail „Du hast ein Kind angelegt“ + **Vereinsbestätigung**: Das Jugendkonto wird in einem Verein nur `active`, wenn der Vorstand das Kind kennt (Einladung vom Verein oder Beitrittsfreigabe durch den Vorstand). Anlage durch Fremde ohne Vereinsbezug bleibt folgenlos: das Jugendkonto kann nichts. Eine strengere Prüfung (z. B. Kleinbetrag, Post-Ident) ist Anwaltsfrage.

### 3.2 Nachweis append-only
`guardian_consents` nur INSERT (DB-Trigger wie `avv.acceptances`, `meta`-Test in `db/migration.spec.ts`), einzige zulässige Änderung: `guardian_user_id` auf NULL bei Kontolöschung des Elternteils (Trigger lässt nur das zu). Widerruf = neuer Eintrag `granted=false`, kein UPDATE. Jeder Elternschritt wird zusätzlich im Zugriffsprotokoll festgehalten (`AuditService`, ohne Inhalte): `youth.created`, `youth.consent.granted|revoked`, `youth.suspended`, `youth.deleted`, `guardian.invited`, `guardian.accepted`, `youth.graduated`.

### 3.3 Export, Löschung, Fristen
Neue Pflichtmethoden im Dienst `GuardianshipService` (`apps/api/src/auth/guardianship.service.ts`, Muster `exportFor`/`eraseUser`/`purgeExpired`; **privacy-Allowlist bleibt unverändert**, `PrivacyService` ruft nur den Dienst):
- **Export Elternteil**: eigene Verknüpfungen (Kind-ID, Vorname/Initiale, Status, Rechnungsempfänger), eigene Freigaben/Einwilligungen (Zweck, Zeit, Version). Kein Export fremder Elternteile (nur Anzahl).
- **Export Jugendkonto**: Der Export des Kindes (`GET /privacy/export`) wird **vom Elternteil** ausgelöst („Daten meines Kindes“, Endpunkt `GET /guardian/youth/:id/export`, Rate-Limit wie `privacy.export`). Inhalt wie heute (Konto, Profil, Beiträge, Likes, Zusagen, Anwesenheit, Chat-Nachrichten, Rechnungen) plus Freigaben.
- **Löschung**: `eraseUser` für Jugendkonto: `youth_profiles` (Kaskade), `guardianships` (Kaskade), `guardian_invites`. **Nachweise** `guardian_consents` bleiben **pseudonym** (nur IDs, kein Name) **3 Jahre ab Löschung** (Verjährung § 195 BGB, Nachweis gegenüber Anspruchstellern; Frist ist Vorschlag, Rechtsfrage), danach `purgeExpired`. Bei Löschung des Elternteils: Spalte `guardian_user_id` leer, Zeile bleibt.
- **Fristen** (`apps/api/src/common/retention.ts`): `guardian_invites` 7 Tage nach Ablauf; `guardian_consents` 3 Jahre nach Konto-/Freigabeende; `youth_profiles.birth_date` mit Übernahme/Löschung; Anwesenheit Jugendlicher **12 Monate** statt 24 (Vorschlag, `attendanceYouthMonths`, Löschjob `EventsService.purgeExpired` bekommt Unterscheidung nach Jugend/Alter zum Erfassungszeitpunkt; **vorsichtshalber Altersflagge am Datensatz** `attendance.youth boolean` bei Erfassung speichern, damit die Frist nach Übergang auf 16 nicht nachträglich verlängert wird; Alternative: einheitlich 12 Monate für alle, einfacher). Benachrichtigungen, gelöschte Beiträge usw. unverändert.
- **Chat-Retention** für Gruppen mit Jugendlichen: Standard **90 Tage** statt 365 (Gruppen-Einstellung `setRetention` vorbelegen, Vorstand kann verlängern bis 365, Rechtsfrage).

### 3.4 Keine Art.-9-Daten
Keine Gesundheits-, Religions-, Ethnie-Felder; kein Grund bei Abwesenheit (Hinweistext bleibt). Allergie-/Medikamentenangaben für Ausflüge sind **ausdrücklich nicht** Teil dieses Pakets (wären Art. 9; bei Bedarf separates Vereinsformular außerhalb der Plattform). Foto-Einwilligungen: Gesichtserkennung/Biometrie nie. Freitextfelder im Jugendkonto: keine (Bio/Ort gesperrt), Kommentare nach Freigabe mit Filter.

### 3.5 Weitere Datenschutzpunkte
- **DSFA** (steht in `FRAGENLISTE` Zeile 236 aus): Jugendkonto ist ein Kernpunkt (Minderjährige = schutzbedürftige Personen, Chat, Profiling-Verzicht). Dieses Konzept liefert die Beschreibung.
- **VVT/Datenschutzerklärung**: neuer Abschnitt „Jugendkonten und Elternkonten“ in `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Tabelle) und 4; Elterninformation (Art. 13) kindgerecht in zwei Fassungen (für Eltern juristisch, für Kinder einfache Sprache), Text unter `/datenschutz` und im Aktivierungsdialog.
- **Mailversand**: keine Mails an Platzhalteradressen; Elternmails mit Kurztexten, kein Kindesname im Betreff (Vorname + Initiale im Text).
- **Logs/Metriken**: keine Geburtsdaten, kein Kindesname in Logs; `/metrics` ohne Jugendbezug.
- **Backups**: Geburtsdatum wird mit Jugendkonto gelöscht, Backups verfallen nach Aufbewahrung (wie sonst).
- **Telemetrie/Feed-Ereignisse**: für Jugendkonten werden **keine** Interaktionsereignisse zur Personalisierung erfasst.

### 3.6 Offene Rechtsfragen (Anwalt/DSB, zusätzlich in `docs/OFFENE-PUNKTE.md` eintragen)
1. Reicht die **Selbstauskunft + Vereinsbestätigung** als Nachweis der Elternschaft (Art. 8 Abs. 2 DSGVO: „angemessene Anstrengungen“)? Genügt Double-Opt-in-Mail?
2. **Mitlesen der Eltern in Gruppenchats**: zulässig/erforderlich? Informationspflicht gegenüber allen Mitgliedern, Verhältnis zum Persönlichkeitsrecht Jugendlicher, Löschfrist 90 Tage?
3. **Zwei-Erwachsene-Regel** und Verbot der Direktnachricht Erwachsener an Kinder: genügt als Jugendschutzkonzept nach JMStV/JuSchG (Betreiberpflichten Vorsorgemaßnahmen §24a JuSchG)? Brauchen wir Altersverifikation/Meldekontakt?
4. **Chronologischer Feed** statt Personalisierung für Minderjährige: Pflicht oder Empfehlung (DSA Art. 28)?
5. **Beitragspflicht und Rechnungsempfänger** (§§ 107 ff. BGB; GoBD-Rechnung an Elternteil mit Kindesbezug, Namen des Kindes auf Rechnung zulässig?).
6. **Nachweisaufbewahrung 3 Jahre** (`guardian_consents`) gegen Löschanspruch des Kindes.
7. **Anwesenheit Minderjähriger**: 12 vs. 24 Monate; Information der Eltern (siehe Fragenliste B9).
8. **Sorgerechtskonflikt**: Pflichten des Betreibers bei widersprüchlichen Eltern; Löschung durch einen Elternteil.
9. **Übergang 16**: Wirksamkeit der Weiternutzung bei Einwilligungen, die Eltern erteilt haben (Neu-Einwilligung nötig?).
10. **Import von Minderjährigen**: Einladung an die Eltern, Hinweis auf Informationspflicht des Vereins (Art. 13/14) gegenüber Eltern und Kind.
11. **Foto-Einwilligungen** (KUG/DSGVO): Eltern-Einwilligung pro Verein und Veröffentlichungsart.

---

## 4. Auswirkungen auf bestehende Bereiche

### 4.1 Rechnungen (`apps/api/src/billing`)
- **Empfänger = Elternteil.** `billing.invoices` bekommt Spalten `subject_user_id uuid null` (Kind, **ohne FK**, Billing bleibt FK-frei) und `subject_name text` (Kopie „Vorname Nachname des Kindes“; GoBD-Kopie bleibt unverändert). Bei Rechnung für Kind: `recipient_user_id` = `is_billing_contact`-Elternteil, Anschrift aus dem Elternteil (`member_profiles` des Elternteils im Verein oder, falls nicht Mitglied, Eltern-Anschriftsfeld aus der Mitgliedsprofil-Zeile des Kindes `billingAddressSource='guardian'`). Positionsbezeichnung: „Mitgliedsbeitrag <Klasse> für <Kind>, <Zeitraum>“.
- **Beitragslauf** (`fee-runs.service.ts: createDrafts`, `MembersService.feeRunCandidates`): Für Kandidaten mit `account_type='youth'` wird der Empfänger über `GuardianshipService.billingContactOf(youthId)` (neue Methode im `UsersDirectory`-Umfeld: `YouthDirectory`) aufgelöst; fehlt ein aktiver Rechnungsempfänger, landet das Kind in der Vorschau unter „ohne Rechnungsempfänger“ (neben „ohne Klasse“, `withoutClass`) und wird **übersprungen**, nie an das Kind adressiert. Vorschau zeigt nur Zahlen.
- **„Meine Rechnungen“**: Jugendkonto sieht keine Rechnungen (Endpunkt gesperrt); Elternteil sieht sie, mit Kindesbezug (Filter nach Kind). Benachrichtigung `invoice_new` an den Elternteil, Betreff ohne Kindesnamen.
- **Geschwister/Familie**: eine Sammelrechnung je Elternteil und Lauf (Etappe 5, optional); zunächst eine Rechnung je Kind.
- **Kontolöschung Elternteil**: bestehende Anonymisierung (Name/Anschrift der Rechnungen), `subject_name` wird mit anonymisiert.
- **Kontolöschung/Übergang Kind**: `subject_user_id` leer bei Kindlöschung; Name bleibt in der Kopie (Aufbewahrungspflicht, wie heute bei Empfängern).
- **Mahnwesen/Zahlung** (Job `billing.overdue`): Benachrichtigung an den Elternteil.

### 4.2 Anwesenheit (`events/attendance.service.ts`)
Erfassung unverändert nur durch Vorstand/Moderation. Neu: (a) Elternübersicht zeigt die Anwesenheit **des eigenen Kindes**; (b) Altersflagge/Frist 12 Monate (3.3); (c) Datenauskunft der Eltern enthält die Anwesenheit; (d) Jugendkonto selbst sieht keine Anwesenheitsliste. Terminzusagen und Anwesenheit des Kindes sind keine Gesundheitsdaten (kein Grund bei „entschuldigt“).

### 4.3 Moderation (`posts/moderation.service.ts`, `plattform`)
Kommentare von Jugendkonten tragen in `GET /orgs/:slug/moderation/comments` ein Merkmal `authorIsYouth` (Badge „Jugendkonto“ ohne Alter). Der Kontaktdaten-Filter lehnt beim Anlegen ab (nicht erst Moderation). Meldungen **gegen** oder **von** Jugendkonten bekommen Kategorie „Jugendschutz“ und stehen in der Plattformmoderation oben (`/plattform`). Plattform-Admins sehen Chat-Klartext Jugend nur mit `AuditService`-Eintrag (wie heute). Kein „stilles“ Ausblenden ohne Begründung für Jugendkommentare (Begründung ≥ 10 Zeichen gilt ohnehin).

### 4.4 Beitragsklassen (`members.fee_classes`)
Optionale Felder `min_age`/`max_age` (nullable, nur **Hinweis**, kein Automatismus): Mitgliederliste markiert „Klasse passt nicht zum Alter“ (Altersberechnung nur für Vorstand/Kassenwart aus dem Vereins-Geburtsdatum bzw. `youth_profiles`); beim Übergang 16 Aufgabe „Klasse prüfen“. Beitragsklasse „Familie/Geschwister“ nicht in diesem Paket.

### 4.5 Mitgliederliste (`members/members.service.ts`, `members-admin.tsx`)
Badge „unter 16“ (aus `account_type`, nicht aus Vereins-Geburtsdatum), Elternname und **„Elternteil kontaktieren“** (Chat mit dem Elternteil über das bestehende `canContact`: beide aktive Mitglieder bzw. Elternteil ist selbst Mitglied; sonst Plattformfunktion „Elternkontakt“ nur für Vorstand/Moderation des Vereins), **keine E-Mail-Adressen** in der Liste (Konvention bleibt). `guardianName/guardianEmail` in `member_profiles` entfallen für Jugendkonten (Verknüpfung ersetzt sie); bleiben nur für **Mitglieder ohne Konto**, falls der Verein solche je erfassen darf (nicht Teil dieses Pakets). Export (CSV) enthält für Jugend „Elternteil: Name“ statt E-Mail. Mitgliedsnummer, Eintritt und Beitragsklasse wie bisher. Austritt: `anonymizeOnLeave` zusätzlich Freigabe `org_membership` für diesen Verein auf `granted=false` stellen (neuer Nachweis-Eintrag durch den Dienst, Ursache „Austritt“).

### 4.6 Einladungen und Import
- **Einladungslinks** (`orgs/org-admin.service.ts`, `invites/:token`): Auf der Einladungsseite (`apps/web/app/einladung/[token]`) sieht ein Elternkonto nun „Für mich beitreten“ oder „Für mein Kind beitreten“ (Kind auswählen oder neu anlegen). Jugendkonto: Annahme gesperrt. Der Verein kann beim Link einen Hinweis „Jugendmannschaft: Eltern nehmen für Kinder an“ setzen.
- **CSV-Import** (`members/member-import.service.ts`, `csv.ts`, `member-import.tsx`): Neue **optionale** Spalten `geburtsdatum` und `eltern_email`. Ist `geburtsdatum` < 16 Jahre, ist `eltern_email` Pflicht; die Zeile erhält Status „Kind“ und die **Einladung geht an die Elternadresse** (eigene Mailvorlage `member-invite-guardian` in `mail.templates.ts`: „Dein Kind X wurde von Verein Y eingeladen, ein Jugendkonto anzulegen“, Kindesname nur Vorname, kein Geburtsdatum in der Mail). Ohne Geburtsdatum bleibt es wie heute (Einladung an die angegebene Adresse), aber der Hinweis im Dialog „Kinder unter 16: Geburtsdatum und Elternadresse angeben, sonst darf das Kind der Einladung nicht folgen“. Beim Beitritt prüft `adopt()` das Alter: Annahme durch ein Konto, dessen Profil die Vormerkung als „Kind“ ausweist, legt Elternkonto-Verknüpfung + Jugendkonto an (Elternteil nimmt an, Kind hat noch kein Konto) und übernimmt Nummer, Eintritt, Klasse.
  - `members.pending_members` bekommt `birth_date date null`, `guardian_email text null`, `is_minor boolean`. Beide Felder werden **mit Annahme oder Fristablauf gelöscht** (wie Adresse), Geburtsdatum wandert nur ins Jugendprofil.
  - Datensparsamkeit: `guardian_email` in Mailsperrliste `invite` einbeziehen.
  - Rechenpfade: `MEMBER_IMPORT_LIMITS` unverändert.
- **Eltern ohne Konto**: Die Einladungsmail führt zur Registrierung (Elternkonto) und danach zum Kind-Dialog (Deep-Link `/einladung/<token>`).

### 4.7 Weitere Bereiche
- **Terminserien/Kalender**: Kalender-Abo des Elternkontos kann Termine der Kinder enthalten (`calendar-feed.service.ts` erhält Option „Termine meiner Kinder“).
- **Teams** (`teams.service.ts`): Jugendkonten dürfen Team-Mitglied sein, nie Team-Verwaltung.
- **Dashboard** (`dashboard`): Kennzahlen zählen Kinder mit; Altersstruktur-Kennzahl (U6/U12/U16) nur für Vorstand, nur aus Vereinsdaten, optional später.
- **Öffentlicher Bereich**: keine Änderung außer Test „keine Jugenddaten“.
- **2FA/Sitzungen**: Jugend-Sitzungen kürzer (7 Tage statt Standard), kein „Angemeldet bleiben“-Zeitfenster über 7 Tage.

---

## 5. API- und UI-Änderungen

### 5.1 Zentrale Durchsetzung (wichtigste Entwurfsentscheidung)
- `packages/shared/src/index.ts`: `PublicUser` bekommt `accountType: "adult" | "youth"` (und `guardianOf?: { id; name }[]` für Eltern, nur in `GET /auth/me`). Neue Dateien `packages/shared/src/youth.ts` (Konstanten, Zod-Schemas) und `youth-consent.ts` (Texte, Version): `YOUTH_AGE_LIMIT`, `YOUTH_CAPABILITIES`, `CreateYouthInput` (Vorname, Nachname-Initiale/Nachname, Geburtsdatum, Benutzername optional), `GuardianConsentInput`, `YouthPermissions`.
- **Neuer Dienst `YouthPolicyService` + `YouthDirectory`** in `apps/api/src/auth/` (Pendant zu `users-directory.service.ts`): `isYouth(userId)`, `guardiansOf(youthId)`, `youthOf(guardianId)`, `permission(youthId, purpose, orgId?)` (letzter Nachweis + Widerspruchsregel), `billingContactOf(youthId)`. Regeln als reine Funktionen in `apps/api/src/common/youth-policy.ts` (testbar ohne DB): `canYouth(capability, ctx)`.
- **Globaler `YouthGuard`** (zweiter Guard hinter `SessionGuard`, in `session.guard.ts`/`youth.guard.ts`): Für `accountType='youth'` ist jede Route gesperrt (403 „Dafür brauchst du ein Elternkonto“), außer sie trägt `@YouthAllowed("<capability>")`. Positivliste (Etappe 3): `GET feed`, `GET orgs/:slug/posts`, `POST posts/:id/like`, `GET posts/:id`, `GET posts/:id/comments`, `GET events`, `GET events/:id`, `PUT events/:id/rsvp`, `GET orgs` (eigene), `GET auth/me`, `POST auth/logout`, `GET sessions`, `PUT password`, Chat-Routen mit Gruppenprüfung, Melden. Alles andere (Posten, Profil-Suche, Follow, Medien, Rechnungen, Kalender-Abo, Einladungen) bleibt gesperrt. Zusätzlich „Defense in Depth“ in den Diensten: `PostsService.create`, `ChatService.createDirect`, `OrgsService.canContact/accept` prüfen `isYouth` selbst, damit ein vergessener Dekorator nichts öffnet. Test `youth-guard.spec.ts` iteriert **alle** Controller-Routen (über das Nest-Routing-Metadatum) und scheitert, wenn eine Route weder `@YouthAllowed` noch `@AdultOnly` trägt (neue Endpunkte erzwingen eine Entscheidung).
- **Login**: `POST /auth/login` akzeptiert `identifier` = E-Mail **oder** `@handle` (Jugendkonten loggen sich nur mit Handle ein; E-Mail-Pfad bleibt für Erwachsene; Platzhalteradresse nicht einloggbar). Fehler generisch (wie heute). Login-Drosselung wie sonst, zusätzlich Meldung an Eltern bei Sperre.

### 5.2 Neues Modul `guardian` (Eltern-API) unter `apps/api/src/auth/` oder eigenem Ordner `apps/api/src/guardian/` 
(Bereich identity; **keine** Tabellen von social/chat/billing/members direkt, nur deren Dienste.)
| Endpunkt | Zweck |
|---|---|
| `GET /guardian/children` | Kinderliste mit Vereinen, Freigaben-Stand |
| `POST /guardian/children` | Jugendkonto anlegen (Vorname, Nachname, Geburtsdatum; Selbstauskunft; erzeugt Handle, Platzhalter-E-Mail; schreibt `guardian_consents`) |
| `GET /guardian/children/:id` | Übersicht (Termine, Anwesenheit, Rechnungen, Protokoll) |
| `PUT /guardian/children/:id/permissions` | Freigaben je Zweck/Verein (schreibt neuen Nachweis) |
| `POST /guardian/children/:id/suspend`, `.../unsuspend` | Notbremse |
| `POST /guardian/children/:id/login` (Etappe 3) | Login aktivieren, Passwort setzen |
| `POST /guardian/children/:id/invite-guardian` | Zweiten Elternteil einladen (Mail-Link) |
| `POST /guardian/invites/:token/accept` | Einladung annehmen |
| `PUT /guardian/children/:id/billing-contact` | Rechnungsempfänger wechseln |
| `POST /guardian/children/:id/join` (mit Einladungstoken) | Verein beitreten für Kind (nutzt `OrgAdminService.acceptInvite` mit Kind-Kontext) |
| `PUT /guardian/children/:id/events/:eventId/rsvp` | Zu-/Absage für das Kind |
| `GET /guardian/children/:id/export` | Datenexport (Art. 15/20) |
| `DELETE /guardian/children/:id` | Löschung (Passwort-Prüfung) |
Alle Routen mit Zod-Schemas aus `packages/shared`, Limits (Anlage 5/Tag, Einladung 5/Tag), Audit-Einträge, Tests.

### 5.3 Änderungen an bestehenden Modulen (Dateien)
- `auth/auth.service.ts` (`register`: Hinweis, `login`: Handle, `userForToken`: `accountType` ins PublicUser, Sitzungslänge Jugend, `youth.graduation`-Job, Passwort-Reset für Kind nur über Eltern), `auth/auth.controller.ts` (Login-Schema), `auth/email-flows.service.ts` (Aktivierung/Übernahme, `guardian-invite`), `auth/users-directory.service.ts` (gekürzte Namen für Jugend, `{ full }`), `auth/session.guard.ts` (+ `YouthGuard`).
- `orgs/orgs.service.ts` (`canContact`: Jugend-Regel; `contactCandidates`: keine Jugend; Mitglieder-Anträge/Annahme gesperrt; `setRole`: nur member; `members()`: Badge), `orgs/org-admin.service.ts` (Annahme für Kind durch Elternteil, Import-Annahme `adopt`).
- `members/members.service.ts` (`list`, `record`: Badge/Elternname; `feeRunCandidates`: Empfängerauflösung; `anonymizeOnLeave`: Freigabe-Eintrag; `exportCsv`), `members/member-import.service.ts` + `csv.ts` (Spalten, Altersprüfung, `member-invite-guardian`), Schema `pending_members`.
- `profiles/profile-access.service.ts` (`canView`, `ensureMany`, Handle-Erzeugung ohne Klarnamen), `profiles/profiles.service.ts` + `profiles.controller.ts` (Suche, Folgen, Update-Filter).
- `posts/posts.service.ts` (Feed-Jugendpfad, Kommentar-Gate und Kontaktdatenfilter, Likes nur Vereinsbeiträge, `authorIsYouth`), `posts/moderation.service.ts`, `feed/ranking.ts` (Jugend nie über Ranking).
- `chat/chat.service.ts` (`createDirect`, `createGroup`: Zwei-Erwachsene-Regel, Elternbeobachter, `addMembers`, Retention-Voreinstellung 90 Tage, `send`-Push), Schema `chat.conversation_members.role` um `guardian_viewer` erweitern, `chat/ws-gateway.ts` (Jugendkonto nur Räume mit Freigabe).
- `events/events.service.ts` (RSVP-Gate und Benachrichtigung der Eltern), `events/shifts.service.ts` (Eintragung gesperrt), `events/attendance.service.ts` (Altersflagge, Elternansicht), `events/calendar-feed.service.ts` (Termine der Kinder im Elternkalender).
- `billing/billing.service.ts`, `billing/fee-runs.service.ts`, `billing/invoice-pdf.ts` (Kindesbezug in Position), Schema `billing.invoices`.
- `privacy/privacy.service.ts` (ruft `GuardianshipService.exportFor/eraseUser`), `common/retention.ts`, `privacy/retention.service.ts` (neue Fristen), `db/boundaries.spec.ts` (social/billing/chat/members dürfen `guardianships`/`guardianConsents` nicht importieren; billing darf `identity.*` weiter nicht), `mail/mail.templates.ts` (`guardian-invite`, `member-invite-guardian`, `youth-graduation`), `notifications` (neue Typen `child_event_rsvp`, `child_graduation`, `child_comment_pending` je mit Export-Feldern in `EXPORT_KEYS`).
- `media/media.service.ts` (Upload für Jugend gesperrt, außer Avatar mit Freigabe).
- `public/*` (Test: keine Jugenddaten).

### 5.4 Web (`apps/web`)
- `lib/auth.tsx`: `accountType`, `isYouth`; Shell (`components/app-shell.tsx`) zeigt für Jugend eine **reduzierte Navigation** (Feed, Kalender, Chat nur bei Freigabe, Einstellungen/Abmelden), keine Befehlspalette-Personensuche (`components/command-palette.tsx`).
- Neu: `apps/web/app/(app)/kinder/page.tsx` + `kinder/[id]/page.tsx` (Elternübersicht), `components/kinder-admin.tsx`, `components/youth-permissions.tsx` (Freigabe-Schalter mit `SegmentedControl`/Dialog, Text je Zweck, Widerruf), `components/guardian-consent-dialog.tsx`, `components/youth-badge.tsx` (Badge „Jugendkonto“ in Moderation und Mitgliederliste).
- `app/(auth)/registrieren`: Hinweistext „Unter 16?“; `app/(auth)/login`: Feld „E-Mail oder @Benutzername“; neue Seite `app/(auth)/konto-uebernehmen` (Übergang 16); `app/einladung/[token]`: „Für mein Kind“-Auswahl; `components/member-import.tsx`: neue Spalten, Hinweise; `components/members-admin.tsx`: Badge/Elternname; `components/moderation-queue.tsx`/`moderation-tool.tsx`: Badge; `app/(app)/rechnungen`: Kindesfilter; `lib/api.ts`/`lib/use-api.ts`: neue Aufrufe. Texte: Du-Form, kindgerecht auf Jugendseiten, keine Mock-Daten, nicht Gebautes als „Kommt später“.
- **A11y/Design**: Kontrast und Touch-Ziele wie bisher (`hit-area`), axe-Tests für Elternübersicht und Aktivierungsseite.

### 5.5 Migrationen
Drizzle, nächste freie Nummer (heute 0029; bei paralleler Arbeit anderer Wellen Nummern abstimmen, Muster siehe „Migration als 0028 neu erzeugt“ im letzten Merge):
1. `0029_youth_accounts`: `users.account_type`, `identity.youth_profiles`, `identity.guardianships` (inkl. partiellem Unique-Index), `identity.guardian_invites`, `identity.guardian_consents` + Append-only-Trigger.
2. `0030_youth_members_billing`: `members.pending_members` (`birth_date`, `guardian_email`, `is_minor`), `billing.invoices` (`subject_user_id`, `subject_name`), `members.fee_classes` (`min_age`, `max_age`).
3. `0031_youth_chat_events`: `chat.conversation_members.role` + `guardian_viewer`, `social.attendance.youth` (Altersflagge) falls Variante „Flagge“ gewählt.
Bestandskonten bekommen `account_type='adult'` per Default, **keine** Datenänderung. Rückwärtskompatibel (API kann vor Web ausgerollt werden). `db/migration.spec.ts` um Trigger-Test erweitern.

### 5.6 Tests
- **Unit**: `common/age.spec.ts` (Grenztage 15 Jahre 364 Tage/16. Geburtstag, Schalttag 29.02., Zeitzone Berlin); `common/youth-policy.spec.ts` (alle Kapazitäten × Freigabe × Elternwiderspruch).
- **API (PGlite, `createTestDb()`)**: `guardianship.service.spec.ts` (Anlage, zweiter Elternteil, Limits, Rechnungsempfänger, Löschung Elternteil/Kind, Append-only-Trigger), `youth-guard.spec.ts` (alle Routen müssen entschieden sein; Jugend kann nicht posten/folgen/suchen/anschreiben/hochladen/Rechnungen sehen; Elternfreigabe öffnet genau die vorgesehene Funktion), `youth-chat.spec.ts` (Zwei-Erwachsene-Regel, Elternbeobachter, DM-Sperre für Erwachsene), `youth-feed.spec.ts` (chronologisch, keine Entdecken-Beiträge), `youth-billing.spec.ts` (Beitragslauf an Elternteil, „ohne Rechnungsempfänger“), `youth-graduation.spec.ts` (Job, Übernahme, Datenerhalt, Entfernung Mitleser, Pausierung), `member-import-youth.spec.ts`, `privacy` (Export/Löschung inkl. Nachweis-Frist), `boundaries.spec.ts` erweitert, `public` (keine Jugenddaten), Kontaktdatenfilter-Spec.
- **Echtes Postgres** (CI `api-postgres`): Trigger und Partial-Index laufen dort ebenfalls (JS-Date-Regel aus `sql-date.spec.ts` beachten: Geburtsdatum als `date`-String, `now()` in freien Ausdrücken).
- **Web (vitest)**: Elternübersicht, Freigabedialog, reduzierte Navigation, Login-Feld.
- **E2E** (`e2e/`, Playwright): „Elternteil legt Kind an, nimmt Einladung für Kind an, sagt für Kind zu, bekommt Rechnung“; „Jugendkonto kann nicht chatten/posten (UI und API)“; axe auf Elternübersicht; Fremd-Host-Wächter bleibt.

---

## 6. Etappen, Aufwand, Risiken

Aufwandsangaben: Entwicklertage inkl. Tests und Doku (`DATENSCHUTZ-LAUNCH.md`, `OFFENE-PUNKTE.md`), grob, eine Person.

| Etappe | Inhalt | Aufwand |
|---|---|---|
| **E1 (kleinste sinnvolle Lieferung): Eltern verwalten Kinder, Kind ohne eigenen Login** | Migration `0029`/`0030`; `GuardianshipService`, `YouthGuard` (Kind hat noch kein Login: Schutz vor Missbrauch), Elternübersicht „Meine Kinder“ (anlegen, Vereinsbeitritt per Einladung für Kind, Zusage/Absage für Kind, Rechnungsempfänger, Freigaben nur `account`/`org_membership`), Beitragslauf an Elternteil, Mitgliederliste-Badge, Export/Löschung, Alterslogik + Job `youth.graduation` (nur Benachrichtigung „wird 16“), Datenschutz-Doku. **Löst die Hauptzielgruppe Jugendvereine** (Zusagen, Anwesenheit, Rechnungen laufen über die Eltern) | 10 bis 13 Tage |
| **E2: Einladungen/Import für Kinder, zweiter Elternteil** | CSV-Spalten, Mailvorlage `member-invite-guardian`, Annahme `adopt()` für Kind, `guardian_invites`, Elternkontakt für Vorstand, Beitragsklassen-Altershinweis | 5 bis 7 Tage |
| **E3: Jugendkonto-Login mit Mini-Funktionsumfang** | Login per Handle, reduzierte Navigation, Feed (chronologisch) lesen, Likes, Termine/Zusagen, Profil minimal und privat, Suche/Folgen/Upload gesperrt, Ruhezeit, Sitzungsregeln, Notbremse | 8 bis 10 Tage |
| **E4: Freigaben und Kommunikation** | Kommentare mit Freigabe und Filter, Moderations-Badge, Gruppenchats (Zwei-Erwachsene-Regel, Eltern-Mitlesen), Push, Avatar, Foto-Einwilligung Eltern, Chat-Retention 90 Tage | 10 bis 14 Tage |
| **E5: Übergang 16 vollständig und Familienrechnung** | Aktivierungsflow, Datenübernahme, `billing_only`-Option, Pausierung/Löschfristen, Familien-Sammelrechnung (optional), Altersflagge Anwesenheit | 6 bis 8 Tage |
Gesamt grob 40 bis 50 Tage; Rechtsprüfung parallel ab Woche 1. **E1 und E2 sind der Launch-Mindestumfang für Jugendvereine**, E3 ist der erste Mehrwert für Kinder, E4 ist riskanter (Kommunikation Minderjähriger) und kann nach Rechtsfreigabe folgen.

Reihenfolge-Hinweis: Der Übergang 16 ist ab dem ersten 15-Jährigen relevant. Deshalb steckt der **Job mit Benachrichtigung** schon in E1 und der vollständige Flow in E5; solange E5 fehlt, **pausiert** das Konto am 16. Geburtstag (Elternhinweis „Kind braucht eigenes Konto, bitte bis E5 manuell per Support“), kein Zugriff und keine Daten laufen unkontrolliert weiter.

### Risiken
1. **Rechtliche Nachweisbarkeit der Elternschaft** (Selbstauskunft): Fälschungs-/Missbrauchsrisiko; Mitigation Vereinsbestätigung, Kind kann nichts Wirksames tun ohne Verein.
2. **Sorgerechtskonflikte** und Einseitigkeit (ein Elternteil löscht/sperrt): Regeln 1.4, Support-Prozess nötig, Textbausteine im Anwaltspaket.
3. **Abdeckung aller Endpunkte**: Vergessene Route öffnet etwas für Jugendkonten. Mitigation: Default-deny-Guard + Routen-Vollständigkeitstest.
4. **Platzhalter-E-Mail/Login ohne E-Mail**: Auswirkungen auf Mailflows, Sperrliste, Export (`users.email` wird in vielen Stellen gelesen). Mitigation: eine zentrale Prüfung `isPlaceholderEmail`, Test über alle Mailvorlagen.
5. **Chat-Mitlesen**: Datenschutz der anderen Kinder, Rechtsfrage 2; ggf. Stufe E4 streichen und Chat für Jugend dauerhaft aus lassen.
6. **Datenmenge**: Geburtsdatum in Identity ist neue sensible-nahe Information. Mitigation: nur Jugendkonten, Löschung bei Übernahme.
7. **Komplexität der Freigaben-Logik** (mehrere Eltern, Widerspruch): in einer reinen, getesteten Funktion bündeln.
8. **Beitragsrecht 16–17** und Rechnungsadressat: Rechtsfrage 5 vor E5.
9. **Skalierung**: Policy-Prüfungen je Request (Jugendkonto + Freigabe) dürfen die Session nicht verlangsamen: `accountType` im Session-Cache (`userForToken`, Redis-Cache) mitführen, Freigaben mit 60 s Cache (Schlüssel `youth:perm:<id>`), Invalidierung bei Änderung. Je Kind max. 4 Elternteile, je Elternteil max. 10 Kinder (Dienst-Limit) hält Abfragen klein. Chat-Mitleser erhöhen Mitgliederzahl pro Gruppe (Eltern × Kinder): Gruppen-Limit prüfen (ggf. 200). Keine Auswirkung auf nächste Server-Stufe.
10. **Datenschutz-Folgenabschätzung** und **Kommunikationsaufwand** (Elternfreigaben müssen verständlich sein), sonst Support-Last.

---

## 7. Offene Entscheidungen für den Gründer (kurze Liste mit Empfehlung)

1. **Kind-Login ja oder nein in der ersten Version?** Empfehlung: **E1 ohne Kind-Login** (Eltern verwalten alles), Kind-Login in E3.
2. **Wie sicher muss der Elternnachweis sein?** Empfehlung: Selbstauskunft + bestätigte E-Mail + Vereinsbestätigung; strengere Verfahren nur, wenn der Anwalt es verlangt.
3. **Dürfen Jugendkonten kommentieren und in Chats schreiben?** Empfehlung: ja nur mit Elternfreigabe je Verein, Chat nur in Gruppen mit zwei Erwachsenen und Eltern-Mitlesen; **kein** 1:1 mit Erwachsenen. Wenn Rechtsprüfung unklar: Chat für Jugendkonten zunächst **aus**.
4. **Chronologischer Feed statt Personalisierung für Jugendkonten?** Empfehlung: ja, fest.
5. **Posten durch Jugendkonten?** Empfehlung: dauerhaft **nein** (auch nicht mit Freigabe).
6. **Rechnungsempfänger bei 16 bis 17 Jahren:** Empfehlung: Option „Elternteil bleibt `billing_only` bis 18“, sonst Jugendlicher selbst.
7. **Löschung bei Streit zwischen Eltern:** Empfehlung: Freigaben restriktiv (ein Widerspruch genügt), Löschung durch einen Elternteil mit **7 Tagen Vorankündigung** an die anderen.
8. **Alter-Untergrenze (z. B. 6 Jahre) und Jugend-Sitzungsdauer 7 Tage:** Empfehlung: ja, einstellbar.
9. **Anwesenheitsfrist Jugendliche 12 statt 24 Monate:** Empfehlung: einheitlich 12 Monate für alle (einfacher), nach DSB-Bestätigung.
10. **Wer ist „Trainer“?** Heute `moderator`. Empfehlung: für dieses Paket bei `moderator` bleiben (Zwei-Erwachsene-Regel zählt Vorstand + Moderation), eigene Trainer-Rolle als separates Paket.
11. **Foto-Einwilligungen (Bildrechte) in diesem Paket oder später?** Empfehlung: einfache Elternfreigabe je Verein in E4, vollständiges Foto-Management später.
12. **Rechtsprüfung vor E3/E4:** Empfehlung: Fragen aus 3.6 gebündelt in `docs/recht/FRAGENLISTE-ANWALT-DSB.md` (A3 erweitern) an den Anwalt, **E1 und E2 dürfen vorher gebaut werden**, E3/E4 erst nach Rückmeldung zu Fragen 2 bis 4.
