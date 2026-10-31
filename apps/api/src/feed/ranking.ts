export type Relation = "own" | "friend" | "member" | "follow" | "discover";

const BOOST: Record<Relation, number> = { own: 1.2, friend: 1.6, member: 2, follow: 1.5, discover: 1 };

export type ScoreInput = {
  likes: number;
  comments: number;
  ageHours: number;
  relation: Relation;
  /** Wie oft der Betrachter in den letzten 30 Tagen mit diesem Autor/Verein interagiert hat (Likes + 2 x Kommentare). */
  affinity?: number;
  hasMedia?: boolean;
  kind?: string;
};

/**
 * Transparenter, regelbasierter Score (Feed-Algorithmus v2, ohne ML):
 *   Interaktion (logarithmisch, damit Viralitaet nicht alles erschlaegt)
 *   x Beziehung (eigener Beitrag, Freund, Mitgliedschaft, Verein folgen)
 *   x Affinitaet (bisherige Interaktion mit diesem Autor/Verein)
 *   x Inhalt (Bilder, Termine)
 *   / Alterung (Halbwertszeit ~12 h, Exponent 1,5).
 * Dieselben Faktoren werden dem Nutzer unter "Warum sehe ich das?" erklaert.
 */
export function scorePost(i: ScoreInput): number {
  const engagement = 1 + 2 * Math.log1p(i.likes + 3 * i.comments);
  const decay = Math.pow(1 + Math.max(0, i.ageHours) / 12, 1.5);
  const affinity = 1 + Math.min(1, 0.3 * Math.log1p(Math.max(0, i.affinity ?? 0)));
  const content = (i.hasMedia ? 1.15 : 1) * (i.kind === "event" ? 1.1 : 1);
  return (engagement * BOOST[i.relation] * affinity * content) / decay;
}

/**
 * Vielfalt: gierige Neuordnung. Taucht derselbe Autor/Verein in den letzten `lookback` gewaehlten Beitraegen
 * schon auf, wird sein Score pro Vorkommen mit `penalty` multipliziert. Verhindert Feeds, die aus einem
 * einzigen Absender bestehen. Stabil: bei Gleichstand gewinnt die urspruengliche Reihenfolge.
 */
export function diversify<T extends { key: string; score: number }>(items: T[], lookback = 3, penalty = 0.7): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length) {
    const recent = out.slice(-lookback).map((x) => x.key);
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((item, idx) => {
      const repeats = recent.filter((k) => k === item.key).length;
      const adjusted = item.score * Math.pow(penalty, repeats);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = idx;
      }
    });
    out.push(...pool.splice(best, 1));
  }
  return out;
}

export function reasonFor(
  relation: Relation,
  orgName: string | null,
  likes: number,
  comments: number,
  extra?: { affinity?: number; authorName?: string },
): string {
  const often = (extra?.affinity ?? 0) >= 3 ? " Du interagierst oft mit diesen Beiträgen." : "";
  if (relation === "own") return "Dein eigener Beitrag.";
  if (relation === "friend") return `Du folgst ${extra?.authorName ?? "dieser Person"}.${often}`;
  if (relation === "member") return `Du bist Mitglied bei ${orgName}.${often}`;
  if (relation === "follow") return `Du folgst ${orgName}.${often}`;
  if (likes + comments >= 5) return "Beliebt bei vielen Nutzern.";
  return "Entdecken: neu auf der Plattform.";
}
