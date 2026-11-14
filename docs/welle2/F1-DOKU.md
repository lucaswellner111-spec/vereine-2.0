# F1: Jugendkonten Etappe E2 (zweiter Elternteil, Rechnungsempfänger, Import für Kinder)

Stand: 2026-11-14. Aufbauend auf `docs/welle2/D2-DOKU.md` (E1). Spezifikation: `docs/welle2/JUGEND-KONZEPT.md`. Einträge für `DATENSCHUTZ-LAUNCH.md` (Abschnitt 2/4/5) und `OFFENE-PUNKTE.md` stehen hier gesammelt und werden vom Koordinator übernommen. Kein Kind-Login (E3).

## 1. Umfang
- **Zweiter Elternteil:** Ein Elternteil lädt per Mail einen weiteren ein (`POST /guardian/children/:id/guardians`, Mailvorlage `guardian-invite`, Link `/eltern-einladung/<token>`, 7 Tage gültig, einmalig). Höchstens 2 Eltern je Kind (`MAX_GUARDIANS_PER_CHILD`), eine offene Einladung belegt den zweiten Platz. Annahme nur mit eigenem, bestätigtem Erwachsenenkonto **mit genau der eingeladenen Adresse** (Hash-Vergleich), Selbstauskunft „sorgeberechtigt“ (neuer Nachweis `account` des zweiten Elternteils). Ein weitergeleiteter Link nützt Dritten nichts; Fremde erfahren nichts über das Kind. Beide Eltern sehen und verwalten das Kind; der Einladende bekommt einen Hinweis (`guardian_notice`, ohne Kindesnamen).
- **Freigaben restriktiv:** Widerspricht ein Elternteil der Mitgliedschaft (Austritt = Widerruf mit Person), kann der andere sie nicht allein erneut erteilen (409); nur wer widersprochen hat, hebt es auf, indem er selbst wieder anmeldet. Regel als reine Funktion in `guardian/consent-rules.ts`. Austritte durch den Verein (ohne Person) zählen nicht als Widerspruch. Der andere Elternteil wird beim Austritt benachrichtigt.
- **Löschung mit Vorankündigung:** Mit nur einem Elternteil wie bisher sofort (Antwort `{status:"deleted"}`). Mit zwei Eltern: `DELETE /guardian/children/:id` (Passwort) setzt `youth_profiles.deletion_requested_at/_by`, der andere Elternteil wird benachrichtigt (`deletion_requested`, Frist 7 Tage), das Kind bleibt unverändert; jeder Elternteil kann widersprechen (`DELETE /guardian/children/:id/deletion`). Nach 7 Tagen ohne Widerspruch löscht der tägliche Job `privacy.retention` (`eraseOrphanedYouth`, Audit `youth.deleted` ohne Person). Wiederholter Antrag verlängert die Frist nicht.
- **Rechnungsempfänger wechseln:** `PUT /guardian/children/:id/billing-contact {guardianId}`. Jeder aktive Elternteil darf; beide Updates in einer Transaktion (partieller Unique-Index: genau ein Empfänger). Audit `youth.billing_contact.changed` (nur IDs), Hinweis `billing_changed` an die jeweils andere Person. Bereits gestellte Rechnungen bleiben beim bisherigen Empfänger. 10 Wechsel/Tag.
- **CSV-Import für Kinder:** Optionale Spalten „Geburtsdatum“ und „E-Mail der Eltern“ (auch „Eltern-E-Mail“, „Erziehungsberechtigte“ u. a.). Unter 16 (ab 6): Zeile ist ein Kind, die Einladung (`member-invite-guardian`) geht an die Eltern-Adresse, die eigene Adresse des Kindes wird nicht übernommen; ohne Eltern-Adresse Fehler. Ab 16 oder ohne Geburtsdatum: Erwachsene wie bisher (Geburtsdatum wird dann nicht gespeichert). Vorschau kennzeichnet Kinder („Kind“, Geburtsdatum, „(Eltern)“), Hinweis „Einladung geht an die Eltern“, Checkbox „informiert“ nennt die Eltern. Geschwister mit gleicher Eltern-Adresse sind keine Dubletten (Schlüssel Adresse + Name + Geburtsdatum). E-Mail-Spalte darf bei reinen Kinderlisten fehlen, wenn „E-Mail der Eltern“ da ist.
- **Annahme einer Kinder-Einladung:** Nur über ein Jugendkonto mit **passendem Geburtsdatum** (`/guardian/children/:id/orgs`); das Elternkonto selbst kann sie nicht annehmen (409, Hinweis auf „Meine Kinder“). Web: `/einladung/<token>` zeigt „Einladung für dein Kind“ mit Link zu „Meine Kinder“ (Link kopieren). Gate über `OrgEvents.inviteGate` (orgs kennt `members` nicht).
- **Termin-Benachrichtigungen:** `NotificationsService.notify` ersetzt für `event_created/_reminder/_canceled/_updated/_waitlist_promoted` Jugendkonten durch ihre Eltern (je Elternteil eine, auch bei Geschwistern). Nichts mehr im unbenutzten Posteingang des Kindes.
- **Web:** `components/kind-guardians.tsx` (Eltern, Einladung, Rechnungsempfänger), `kind-detail.tsx` (Löschhinweis/Widerspruch, Dialog „Löschung ankündigen“), `app/eltern-einladung/[token]`, `member-import.tsx` (Spalten, Kind-Kennzeichnung, Hinweis), Benachrichtigungstext `guardian_notice`. Touch-Ziele über `hit-area`, Tabellen als Karten am Handy (`stackTable`) wie bisher.

## 2. Verarbeitungen (für DATENSCHUTZ-LAUNCH Abschnitt 2)
| Verarbeitung | Daten | Zweck | Rechtsgrundlage (Arbeitsannahme) | Frist |
|---|---|---|---|---|
| Einladung zweiter Elternteil (`identity.guardian_invites`) | Kind-ID, einladender Elternteil, Token-Hash, **Hash** der Adresse (HMAC, keine Klartext-Adresse), Status, Ablauf | Verknüpfung des zweiten Elternteils, Schutz vor weitergeleitetem Link | Art. 6 Abs. 1 lit. b/f | Ablauf/Annahme/Widerruf + 30 Tage, dann Job; mit Konto des Einladenden bzw. des Kindes gelöscht |
| Mail an den einzuladenden Elternteil | Adresse nur im Mailjob (Redis, nach Versand entfernt), Name des Einladenden | Zustellung | Art. 6 Abs. 1 lit. f | nicht gespeichert (Kostenbremse über `MailService`) |
| Geplante Löschung (`youth_profiles.deletion_requested_*`) | Zeitpunkt, beantragender Elternteil (ID) | Vorankündigung an den anderen Elternteil | Art. 6 Abs. 1 lit. b/f | bis Löschung/Widerspruch |
| Import für Kinder (`members.pending_members`) | Name, Elternadresse, **Geburtsdatum nur bei Kindern**, Kennzeichen `is_minor` | Persönliche Einladung der Eltern | Art. 6 Abs. 1 lit. b (Verein verantwortlich, AVV) | wie bisher: bei Ablauf der Einladung bzw. 60 Tage unversendet, bei Annahme sofort gelöscht |
| Benachrichtigungen an Eltern | `guardian_notice` (nur Art des Hinweises, ggf. Löschdatum), Termin-Hinweise statt an das Kind an die Eltern | Information | Art. 6 Abs. 1 lit. b | 180 Tage, Export-Felder in `EXPORT_KEYS` |
| Audit | `youth.guardian.invited/invite_revoked/joined`, `youth.billing_contact.changed`, `youth.deletion.requested/canceled`, `members.imported` (+ Anzahl Kinder) mit IDs bzw. Zahlen, ohne Namen, Adressen, Geburtsdaten | Nachvollziehbarkeit | Art. 6 Abs. 1 lit. f | 12 Monate |

## 3. Austritt, Auskunft, Löschung (Abschnitt 4/5)
- Auskunft eines Elternteils (`exportFor`): `guardianInvitesSent` (Kind, Status, Zeitpunkte; keine Adresse, es gibt keine). Auskunft des Kindes unverändert (Zahl der Eltern).
- Konto eines Elternteils gelöscht: seine Einladungen (gesendet/angenommen) werden gelöscht; Nachweise werden wie in E1 entkoppelt; Rechnungsempfänger geht an den anderen Elternteil; eine laufende geplante Löschung bleibt bestehen und läuft weiter (der verbleibende Elternteil kann widersprechen).
- Löschung des Kindes: Einladungen per Kaskade; Nachweise der Freigaben wie in E1 pseudonym 3 Jahre.
- `boundaries.spec.ts`: Privacy-Allowlist **nicht** erweitert. Die neue Tabelle `guardian_invites` liegt in identity und wird nur von `guardian` genutzt; die Listen `IDENTITY_TABLES`/`YOUTH_TABLES` in `boundaries.spec.ts` wurden nicht ergänzt (Anpassung der Wächter-Datei bewusst dem Gründer überlassen, siehe offene Punkte).

## 4. Migration
`0032_f1_guardian_invites_import_youth`: `identity.guardian_invites`; `identity.youth_profiles.deletion_requested_at/_by`; `members.pending_members.is_minor/birth_date` (CHECK: Kind braucht Geburtsdatum), Unique `(org, email)` ersetzt durch zwei partielle Unique-Indizes (Erwachsene je Adresse; Kinder je Adresse + Name + Geburtsdatum).

## 5. Rate-Limits
Einladung zweiter Elternteil 5/Tag (Elternteil) und 20 Mails/Tag (Konto, Kostenbremse), je Empfängeradresse 5/h (`MailService`); Annahme 10/Tag; Rechnungsempfänger-Wechsel 10/Tag; Löschen 10/h (wie E1); Import mit Kindern 5/Tag je Verein (zusätzlich Vorschau 30/h, Bestätigung 20/h wie bisher).

## 6. Offene Rechtsfragen (zusätzlich in OFFENE-PUNKTE.md)
1. Höchstens zwei Eltern je Kind: reicht das (Patchwork, Vormund, Pflegeeltern)? Bei Sorgerechtsstreit entscheidet keine Plattform; die Regel „ein Widerspruch genügt“ ist eine Produktentscheidung.
2. Hash der Elternadresse und Bindung der Annahme an dieses Konto: ausreichend als Nachweis der Berechtigung? Selbstauskunft des zweiten Elternteils bleibt ungeprüft (wie E1).
3. Löschung durch einen Elternteil gegen Widerspruch des anderen nach 7 Tagen: Gleichrang der Eltern, Verhältnis zu Aufbewahrungspflichten (Rechnungen).
4. Import: Der Verein gibt Name, Geburtsdatum und Elternadresse des Kindes an Klubnest (AVV); die Eltern wissen laut Checkbox Bescheid. Wie wird das gegenüber Eltern belegt (Art. 13/14)? Mailvorlage nennt den Verein als Verantwortlichen.
5. Eine importierte Einladung bindet nur über Geburtsdatum an das richtige Kind (kein Namensabgleich, Spitznamen). Reicht das?

## 7. Risiken / nicht in F1
- Ende der Elternschaft (Elternteil verlässt ein Kind, Sorgerechtswechsel) ist nicht gebaut; es gibt nur Konto löschen.
- Ein Verein sieht weiterhin nur den Rechnungsempfänger (Name, Mitgliederliste). Elternkontakt für den Vorstand und Altershinweise bei Beitragsklassen fehlen (E2-Rest laut Konzept).
- Die Einladung für ein Kind kann nur über „Meine Kinder“ → „Im Verein anmelden“ (Link einfügen) angenommen werden; ein automatisches Anlegen des Kindes aus den Importdaten ist bewusst nicht gebaut (Eltern bestätigen Name und Geburtsdatum selbst).
- Offene Rechnungen bleiben beim bisherigen Empfänger, wenn der Rechnungsempfänger wechselt.
- Mail-Quote voll: `guardian-invite` wird (Kategorie service) auf den nächsten Morgen verschoben, der Einladende sieht die Einladung sofort als offen.
