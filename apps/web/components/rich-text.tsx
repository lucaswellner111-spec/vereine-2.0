import Link from "next/link";
import { Fragment } from "react";

const MENTION = /(^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi;

/** Zerlegt Text in Teile; @Benutzername wird zum Profil-Link (Pruefung der Sichtbarkeit macht die Profilseite). */
export function splitMentions(text: string): ({ text: string } | { handle: string })[] {
  const out: ({ text: string } | { handle: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const start = (m.index ?? 0) + m[1].length; // Position des "@"
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ handle: m[2].toLowerCase() });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Text mit klickbaren @Erwaehnungen (kein HTML, alles als Text ausgegeben). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((p, i) =>
        "handle" in p ? (
          <Link key={i} href={`/profil/${p.handle}`} className="font-medium text-brand hover:underline">
            @{p.handle}
          </Link>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
