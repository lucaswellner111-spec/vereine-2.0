import Link from "next/link";
import { Avatar, Badge, Card, ConceptNote, PageHeader } from "@/components/ui";
import { orgs } from "@/lib/mock";

export const metadata = { title: "Vereine" };

export default function OrgsPage() {
  return (
    <>
      <PageHeader title="Vereine entdecken" subtitle="Finde Vereine in deiner Nähe und folge ihnen." />
      <ConceptNote>Suche, Filter (Kategorie, Ort) und Verein-Anlage kommen mit dem Modul „Vereine“.</ConceptNote>
      <ul className="grid gap-4 sm:grid-cols-2">
        {orgs.map((org) => (
          <li key={org.slug}>
            <Link href={`/vereine/${org.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:bg-surface-2">
                <div className="flex items-center gap-3">
                  <Avatar name={org.name} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{org.name}</p>
                    <p className="text-xs text-muted">{org.city}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{org.about}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Badge>{org.category}</Badge>
                  <span>{org.members} Mitglieder</span>
                  <span>· {org.followers} Follower</span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
