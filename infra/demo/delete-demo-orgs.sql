-- Entfernt die Demo-Vereine (Kaskade loescht Termine, Beitraege, Einladungen, Vereinsbilder, Mitgliedschaften).
-- Nur feste Kennungen, kein Muster: es kann kein echter Verein getroffen werden. Erst NACH dem Loeschen der Demo-Konten ausfuehren.
-- Aufruf: siehe infra/demo/cleanup-demo.sh (psql < diese Datei)
begin;

select 'Vereine vor dem Loeschen' as schritt, count(*) from social.organizations
 where slug in ('freiwillige-feuerwehr-wesenberg', 'fc-blau-weiss-lindenau', 'tsv-beispielburg-1923');

delete from social.organizations
 where slug in ('freiwillige-feuerwehr-wesenberg', 'fc-blau-weiss-lindenau', 'tsv-beispielburg-1923');

commit;
