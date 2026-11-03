/**
 * Katalog der Tags (Sportarten und Vereinsthemen). Feste, kuratierte Liste: Vereine und Beitraege waehlen daraus,
 * es gibt keine freien Hashtags. IDs sind stabile Kennungen (nie umbenennen, nur Label darf sich aendern).
 * Bewusst keine sensiblen Kategorien (Art. 9 DSGVO: Religion, Gesundheit, politische Meinung ...).
 */
export const TAG_GROUPS = [
  "Ballsport",
  "Rückschlag & Präzision",
  "Leichtathletik & Turnen",
  "Wasser & Wintersport",
  "Kampfsport",
  "Rad, Reiten & Motor",
  "Fitness & Tanz",
  "Denk- & Gesellschaftsspiele",
  "Rettung & Ehrenamt",
  "Kultur & Brauchtum",
  "Natur & Freizeit",
  "Jugend & Soziales",
] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

type TagDef = { id: string; label: string; group: TagGroup };
const t = (group: TagGroup, entries: [string, string][]): TagDef[] => entries.map(([id, label]) => ({ id, label, group }));

export const TAGS: readonly TagDef[] = [
  ...t("Ballsport", [
    ["fussball", "Fußball"], ["handball", "Handball"], ["basketball", "Basketball"], ["volleyball", "Volleyball"],
    ["hockey", "Hockey"], ["rugby", "Rugby"], ["baseball", "Baseball & Softball"], ["wasserball", "Wasserball"],
    ["faustball", "Faustball"], ["futsal", "Futsal"], ["american-football", "American Football"], ["floorball", "Floorball"],
  ]),
  ...t("Rückschlag & Präzision", [
    ["tennis", "Tennis"], ["tischtennis", "Tischtennis"], ["badminton", "Badminton"], ["squash", "Squash"],
    ["golf", "Golf"], ["kegeln", "Kegeln & Bowling"], ["schiessen", "Schießsport"], ["bogenschiessen", "Bogenschießen"], ["dart", "Dart"],
  ]),
  ...t("Leichtathletik & Turnen", [
    ["leichtathletik", "Leichtathletik"], ["laufen", "Laufen & Walking"], ["turnen", "Turnen"], ["gymnastik", "Gymnastik"],
    ["triathlon", "Triathlon"], ["klettern", "Klettern"], ["trampolin", "Trampolin"],
  ]),
  ...t("Wasser & Wintersport", [
    ["schwimmen", "Schwimmen"], ["rudern", "Rudern"], ["segeln", "Segeln"], ["kanu", "Kanu & Kajak"], ["tauchen", "Tauchen"],
    ["wintersport", "Wintersport"], ["eishockey", "Eishockey"], ["eislaufen", "Eislaufen"], ["curling", "Curling"],
  ]),
  ...t("Kampfsport", [
    ["judo", "Judo"], ["karate", "Karate"], ["taekwondo", "Taekwondo"], ["boxen", "Boxen"], ["ringen", "Ringen"], ["fechten", "Fechten"], ["selbstverteidigung", "Selbstverteidigung"],
  ]),
  ...t("Rad, Reiten & Motor", [
    ["radsport", "Radsport"], ["mountainbike", "Mountainbike"], ["reiten", "Reiten"], ["motorsport", "Motorsport"], ["skaten", "Skaten & Inlineskaten"], ["modellflug", "Modellflug"],
  ]),
  ...t("Fitness & Tanz", [
    ["fitness", "Fitness"], ["yoga", "Yoga"], ["tanzen", "Tanzen"], ["gesundheitssport", "Gesundheits- & Rehasport"], ["behindertensport", "Inklusions- & Behindertensport"], ["seniorensport", "Seniorensport"],
  ]),
  ...t("Denk- & Gesellschaftsspiele", [
    ["schach", "Schach"], ["skat", "Skat & Kartenspiele"], ["esport", "E-Sport"], ["boule", "Boule & Pétanque"],
  ]),
  ...t("Rettung & Ehrenamt", [
    ["feuerwehr", "Feuerwehr"], ["thw", "Katastrophenschutz (THW)"], ["dlrg", "Wasserrettung (DLRG)"], ["rotes-kreuz", "Rettungsdienst & Rotes Kreuz"], ["bergwacht", "Bergwacht"],
  ]),
  ...t("Kultur & Brauchtum", [
    ["chor", "Chor & Gesang"], ["musikverein", "Musikverein & Orchester"], ["theater", "Theater"], ["karneval", "Karneval & Fasching"],
    ["heimat", "Heimat- & Trachtenverein"], ["schuetzenverein", "Schützenverein"], ["kunst", "Kunst & Handwerk"], ["fotografie", "Fotografie"],
  ]),
  ...t("Natur & Freizeit", [
    ["angeln", "Angeln & Fischerei"], ["garten", "Garten & Kleingarten"], ["imkerei", "Imkerei"], ["naturschutz", "Natur- & Umweltschutz"],
    ["wandern", "Wandern"], ["tierschutz", "Tierschutz & Tierzucht"], ["jagd", "Jagd & Hege"],
  ]),
  ...t("Jugend & Soziales", [
    ["jugendarbeit", "Jugendarbeit"], ["foerderverein", "Förderverein"], ["sozialer-verein", "Soziales & Nachbarschaft"], ["bildung", "Bildung & Weiterbildung"], ["sonstiges", "Sonstiges"],
  ]),
];

/** Alle IDs als Tupel (fuer z.enum). */
export const TAG_IDS = TAGS.map((x) => x.id) as [string, ...string[]];
export const MAX_ORG_TAGS = 5;
export const MAX_POST_TAGS = 3;

const byId = new Map(TAGS.map((x) => [x.id, x]));
export const tagLabel = (id: string): string => byId.get(id)?.label ?? id;
export const isTagId = (id: string): boolean => byId.has(id);
