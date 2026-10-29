// Konzept-Daten. Werden schrittweise durch echte API-Aufrufe ersetzt.

export type Org = {
  slug: string;
  name: string;
  category: string;
  city: string;
  members: number;
  followers: number;
  about: string;
  donationGoal?: { title: string; raised: number; goal: number };
};

export const orgs: Org[] = [
  {
    slug: "tsv-musterstadt",
    name: "TSV Musterstadt 1904",
    category: "Sport",
    city: "Musterstadt",
    members: 412,
    followers: 1280,
    about: "Fußball, Turnen und Tischtennis seit 1904. Familienfreundlich und offen für alle.",
    donationGoal: { title: "Neues Flutlicht für den Sportplatz", raised: 6400, goal: 12000 },
  },
  {
    slug: "feuerwehr-nordheim",
    name: "Freiwillige Feuerwehr Nordheim",
    category: "Feuerwehr",
    city: "Nordheim",
    members: 68,
    followers: 940,
    about: "Wir schützen Nordheim – rund um die Uhr, ehrenamtlich. Nachwuchs willkommen!",
    donationGoal: { title: "Jugendfeuerwehr-Ausrüstung", raised: 1850, goal: 3000 },
  },
  {
    slug: "chor-harmonie",
    name: "Gemischter Chor Harmonie",
    category: "Kultur",
    city: "Südstadt",
    members: 45,
    followers: 310,
    about: "Chorgesang von Klassik bis Pop. Proben jeden Donnerstag, 19:30 Uhr.",
  },
  {
    slug: "nabu-ortsgruppe",
    name: "NABU Ortsgruppe Waldtal",
    category: "Umwelt",
    city: "Waldtal",
    members: 133,
    followers: 702,
    about: "Natur- und Artenschutz vor Ort: Amphibienschutz, Streuobstwiesen, Vogelzählung.",
  },
];

export type Post = {
  id: string;
  author: string;
  orgSlug: string;
  time: string;
  ageHours: number;
  text: string;
  likes: number;
  comments: number;
  reason: string;
  kind: "update" | "event" | "donation";
};

export const posts: Post[] = [
  {
    id: "p1",
    author: "TSV Musterstadt 1904",
    orgSlug: "tsv-musterstadt",
    time: "vor 2 Std.",
    ageHours: 2,
    text: "Heimspiel am Sonntag, 15 Uhr! Wir freuen uns über jeden Fan an der Linie. Für Kaffee und Kuchen ist gesorgt.",
    likes: 48,
    comments: 7,
    reason: "Du folgst diesem Verein.",
    kind: "event",
  },
  {
    id: "p2",
    author: "Freiwillige Feuerwehr Nordheim",
    orgSlug: "feuerwehr-nordheim",
    time: "vor 5 Std.",
    ageHours: 5,
    text: "Danke für eure Unterstützung! Für die Jugendfeuerwehr sind schon 1.850 € zusammengekommen. Jeder Euro zählt.",
    likes: 112,
    comments: 15,
    reason: "Viele Mitglieder deiner Vereine interagieren mit diesem Beitrag.",
    kind: "donation",
  },
  {
    id: "p3",
    author: "Gemischter Chor Harmonie",
    orgSlug: "chor-harmonie",
    time: "gestern",
    ageHours: 24,
    text: "Adventskonzert am 14. Dezember in der Stadtkirche. Karten gibt es ab sofort bei allen Chormitgliedern.",
    likes: 33,
    comments: 4,
    reason: "Neu in deiner Region.",
    kind: "update",
  },
  {
    id: "p4",
    author: "NABU Ortsgruppe Waldtal",
    orgSlug: "nabu-ortsgruppe",
    time: "vor 2 Tagen",
    ageHours: 48,
    text: "Die Streuobstwiese wurde um 12 neue Hochstämme erweitert. Danke an alle Helfer:innen beim Pflanztag!",
    likes: 87,
    comments: 9,
    reason: "Passt zu deinen Interessen: Umwelt.",
    kind: "update",
  },
];

export type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  group?: boolean;
  messages: { from: "me" | "them"; text: string; time: string }[];
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    name: "Trainer-Team TSV",
    preview: "Wer übernimmt am Samstag die Kabine?",
    time: "09:41",
    unread: 2,
    group: true,
    messages: [
      { from: "them", text: "Wer übernimmt am Samstag die Kabine?", time: "09:41" },
      { from: "me", text: "Ich kann das machen.", time: "09:43" },
    ],
  },
  {
    id: "c2",
    name: "Marie Schneider",
    preview: "Danke dir, bis Donnerstag!",
    time: "Gestern",
    unread: 0,
    messages: [
      { from: "them", text: "Kommst du zur Chorprobe?", time: "Gestern" },
      { from: "me", text: "Ja, bin dabei.", time: "Gestern" },
      { from: "them", text: "Danke dir, bis Donnerstag!", time: "Gestern" },
    ],
  },
  {
    id: "c3",
    name: "Vorstand Feuerwehr",
    preview: "Protokoll ist im Anhang.",
    time: "Mo.",
    unread: 0,
    group: true,
    messages: [{ from: "them", text: "Protokoll ist im Anhang.", time: "Mo." }],
  },
];

export const members = [
  { id: "m1", name: "Anna Becker", role: "Vorstand", fee: "Erwachsene", status: "aktiv", since: "2011" },
  { id: "m2", name: "Jonas Weber", role: "Mitglied", fee: "Erwachsene", status: "aktiv", since: "2019" },
  { id: "m3", name: "Lea Fischer", role: "Kassenwart", fee: "Erwachsene", status: "aktiv", since: "2015" },
  { id: "m4", name: "Paul Hoffmann", role: "Mitglied", fee: "Jugend", status: "aktiv", since: "2022" },
  { id: "m5", name: "Sabine Koch", role: "Mitglied", fee: "Familie", status: "ruhend", since: "2008" },
];

export const invoices = [
  { id: "RE-2026-0042", to: "Jonas Weber", item: "Jahresbeitrag 2026", amount: 84, status: "bezahlt", due: "31.01.2026" },
  { id: "RE-2026-0043", to: "Paul Hoffmann", item: "Jahresbeitrag 2026 (Jugend)", amount: 36, status: "offen", due: "31.01.2026" },
  { id: "RE-2026-0044", to: "Sabine Koch", item: "Jahresbeitrag 2026 (Familie)", amount: 120, status: "überfällig", due: "31.01.2026" },
];

export const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
