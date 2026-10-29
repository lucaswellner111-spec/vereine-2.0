"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import { Avatar, Badge, Button, Card, ConceptNote } from "@/components/ui";
import { eur, orgs, posts } from "@/lib/mock";

export default function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const org = orgs.find((o) => o.slug === slug);
  const [following, setFollowing] = useState(false);
  if (!org) notFound();

  const orgPosts = posts.filter((p) => p.orgSlug === org.slug);
  const goal = org.donationGoal;

  return (
    <>
      <Link href="/vereine" className="mb-3 inline-block text-sm text-muted hover:text-text">← Alle Vereine</Link>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{org.name}</h1>
            <p className="text-sm text-muted">{org.city} · <Badge>{org.category}</Badge></p>
          </div>
          <div className="flex gap-2">
            <Button variant={following ? "secondary" : "primary"} onClick={() => setFollowing((f) => !f)}>
              {following ? "Folgst du" : "Folgen"}
            </Button>
            <Button variant="secondary">Mitglied werden</Button>
          </div>
        </div>
        <p className="mt-4 text-sm">{org.about}</p>
        <p className="mt-2 text-xs text-muted">{org.members} Mitglieder · {org.followers + (following ? 1 : 0)} Follower</p>
      </Card>

      <ConceptNote>Vereinsseiten (Beiträge, Termine, Mitgliedschaftsantrag, Spendenseite) werden hier ausgebaut.</ConceptNote>

      {goal && (
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{goal.title}</p>
              <p className="text-xs text-muted">{eur(goal.raised)} von {eur(goal.goal)}</p>
            </div>
            <Link href="/spenden" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:opacity-90">Spenden</Link>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round((goal.raised / goal.goal) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, (goal.raised / goal.goal) * 100)}%` }} />
          </div>
        </Card>
      )}

      <h2 className="mb-3 mt-6 font-semibold">Beiträge</h2>
      {orgPosts.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Beiträge.</p>
      ) : (
        <ul className="space-y-3">
          {orgPosts.map((p) => (
            <li key={p.id}>
              <Card>
                <p className="text-xs text-muted">{p.time}</p>
                <p className="mt-1 text-sm">{p.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
