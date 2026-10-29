export type Relation = "own" | "member" | "follow" | "discover";

const BOOST: Record<Relation, number> = { own: 1.5, member: 2, follow: 1.5, discover: 1 };

/**
 * Transparenter, regelbasierter Score (Phase 1, ohne ML):
 * Interaktion (Likes + 3 x Kommentare) x Beziehung, abgeschwaecht durch das Alter.
 * Dieselbe Formel wird dem Nutzer unter "Warum sehe ich das?" erklaert.
 */
export function scorePost(input: { likes: number; comments: number; ageHours: number; relation: Relation }): number {
  const engagement = 1 + input.likes + 3 * input.comments;
  const decay = Math.pow(1 + Math.max(0, input.ageHours) / 12, 1.5);
  return (engagement * BOOST[input.relation]) / decay;
}

export function reasonFor(relation: Relation, orgName: string | null, likes: number, comments: number): string {
  if (relation === "own") return "Dein eigener Beitrag.";
  if (relation === "member") return `Du bist Mitglied bei ${orgName}.`;
  if (relation === "follow") return `Du folgst ${orgName}.`;
  if (likes + comments >= 5) return "Beliebt bei vielen Nutzern.";
  return "Entdecken: neu auf der Plattform.";
}
