# Demo-Daten (Feuerwehr + Fußball)

Zum Ansehen des Feeds mit mehreren Vereinen und Personen. **Vor dem Launch löschen.** Alle Demo-Konten enden auf `@demo.klubnest.invalid`.

## Anlegen
```bash
DEMO_PASSWORD="<starkes Passwort, mind. 12 Zeichen>" BASE_URL=https://klubnest.de node infra/demo/seed.mjs seed
```
- Bilder liegen lokal in `infra/demo/images/` (nicht im Repository, Lizenz beim Betreiber). Dateinamen siehe `seed.mjs`.
- Danach `infra/demo/out/backdate.sql` auf dem Server ausführen (verteilt die Beiträge über zwei Wochen):
  `cat infra/demo/out/backdate.sql | ssh root@SERVER 'cd /opt/vereine && docker compose -f infra/deploy/docker-compose.preview.yml --env-file .env.preview exec -T postgres psql -U vereine -d vereine'`
- Eigenen Account als Mitglied eintragen: per SQL in `social.org_members` und `social.follows` (siehe Verlauf), oder über einen Einladungslink.
- Das Passwort liegt nur lokal in `infra/demo/out/password.txt` (gitignored).

## Neu: rein fiktiver Demo-Verein (für Screenshots)
`infra/demo/fiktiv/` enthält „TSV Beispielburg 1923“: erfundene Personen, selbst erzeugte Grafikbilder (keine Fotos, keine Personen, keine Fremdlizenz, nichts im Repository). Für Screenshots, Vorführungen und Marketing **nur diesen Satz** verwenden, den alten Satz (Feuerwehr/Fußball mit Fotos) nicht mehr.
```bash
DEMO_PASSWORD="<mind. 12 Zeichen>" BASE_URL=https://staging.example.de node infra/demo/fiktiv/seed-fiktiv.mjs seed
node infra/demo/fiktiv/seed-fiktiv.mjs images   # Grafiken nur ansehen (infra/demo/fiktiv/out/, gitignored)
```

## Löschen (empfohlen: ein Befehl mit Kontrolle)
`infra/demo/cleanup-demo.sh --yes` löscht beide Sätze (Konten über die Lösch-Funktion der API, Vereine per SQL mit festen Kennungen) und prüft danach mit `verify-demo-clean.sql`, dass nichts übrig ist. Aufruf und Variablen stehen in der Kopfzeile des Skripts; ohne `--yes` läuft nur ein Probelauf. Zum Hinweis auf Sicherungen und Bilddateien siehe `docs/BETRIEB.md` (Abschnitt Demo-Daten).

Manuell (Einzelschritte):
1. Konten, Beiträge, Bilder und Kommentare: `DEMO_PASSWORD="$(cat infra/demo/out/password.txt)" BASE_URL=https://klubnest.de node infra/demo/seed.mjs cleanup`
2. Die beiden Vereine und Mitgliedschaften fremder Konten entfernen (Kaskade löscht Termine, Beiträge, Einladungen):
```sql
delete from social.organizations where slug in ('freiwillige-feuerwehr-wesenberg','fc-blau-weiss-lindenau');
```
3. Kontrolle: `select count(*) from identity.users where email like '%@demo.klubnest.invalid';` muss 0 sein.

Hinweis: Auf einigen Bildern sind echte Personen (auch Kinder) zu sehen; sie sind nur nach Anmeldung abrufbar. Deshalb vor dem Start mit echten Nutzern entfernen.
