import Link from "next/link";
import type { ReactNode } from "react";
import { LegalPage } from "./site";

/** Bausteine fuer Rechtstexte und Hilfeseiten (ohne Hooks, auch in Server-Komponenten nutzbar). */

export type LegalSection = { id: string; title: string; body: ReactNode };

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted">{children}</ol>;
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-sm font-semibold text-text">{children}</h3>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text">{children}</strong>;
}

const linkClass = "font-medium text-brand underline underline-offset-2 hover:text-text";

/** Interner Link (Next) oder externer Link; mailto: und https: als normales <a>. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    );
  }
  const external = href.startsWith("http");
  return (
    <a href={href} className={linkClass} {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}>
      {children}
    </a>
  );
}

/** Mail-Adresse als Link; Platzhalter bleiben als Text sichtbar. */
export function Mail({ address }: { address: string }) {
  if (address.includes("[")) return <span className="font-medium text-text">{address}</span>;
  return <A href={`mailto:${address}`}>{address}</A>;
}

/** Aufklappbare Frage (natives details-Element: per Tastatur und Screenreader bedienbar, ohne Skript). */
export function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-surface open:bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 font-medium text-text [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

/** Tabelle; am Handy als Karten, damit nichts seitlich scrollt. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-left text-[0.8125rem] max-sm:block">
        <caption className="sr-only">{caption}</caption>
        <thead className="max-sm:sr-only">
          <tr className="border-b border-border text-text">
            {head.map((h) => (
              <th key={h} scope="col" className="px-2 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-border align-top max-sm:mb-3 max-sm:block max-sm:rounded-lg max-sm:border max-sm:bg-surface max-sm:p-3">
              {cells.map((c, j) => (
                <td key={j} className="px-2 py-2 max-sm:block max-sm:px-0 max-sm:py-0.5">
                  <span className="mr-1 font-semibold text-text sm:hidden">{head[j]}:</span>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rechtstext mit Inhaltsverzeichnis, Stand-Angabe und nummerierten Abschnitten. */
export function LegalDocument({ title, intro, updated, sections }: { title: string; intro?: ReactNode; updated: string; sections: LegalSection[] }) {
  return (
    <LegalPage title={title}>
      <p className="-mt-3 text-xs">Stand: {updated}</p>
      {intro ? <div className="space-y-3">{intro}</div> : null}
      <nav aria-labelledby="toc-title" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="toc-title" className="text-sm font-semibold text-text">
          Inhalt
        </h2>
        <ol className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="-mx-2 flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-2 hover:text-text sm:min-h-9">
                <span className="mr-2 w-5 shrink-0 text-xs tabular-nums">{i + 1}.</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 space-y-3">
          <h2 id={`${s.id}-h`} className="pt-4 text-lg font-semibold tracking-tight text-text">
            {i + 1}. {s.title}
          </h2>
          {s.body}
        </section>
      ))}
    </LegalPage>
  );
}
