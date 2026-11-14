-- Kontrolle nach dem Loeschen der Demo-Daten (nur lesend). JEDER Wert muss 0 sein.
-- psql gibt eine Zeile je Pruefung aus; infra/demo/cleanup-demo.sh bricht ab, wenn irgendein Wert > 0 ist.
select 'demo_konten' as pruefung, count(*) as anzahl from identity.users where email like '%@demo.klubnest.invalid'
union all
select 'demo_vereine', count(*) from social.organizations
 where slug in ('freiwillige-feuerwehr-wesenberg', 'fc-blau-weiss-lindenau', 'tsv-beispielburg-1923')
union all
select 'vereine_ohne_aktives_mitglied', count(*) from social.organizations o
 where not exists (select 1 from social.org_members m where m.org_id = o.id and m.status = 'active') and o.slug in ('freiwillige-feuerwehr-wesenberg', 'fc-blau-weiss-lindenau', 'tsv-beispielburg-1923')
union all
-- Vereinsbilder ohne Verein und Nutzerbilder ohne Besitzer sind nicht moeglich (Check-Constraint), verwaiste Zeilen waeren ein Fehler
select 'verwaiste_medien', count(*) from social.media where owner_id is null and org_id is null;
