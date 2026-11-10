import type { MemberImportField } from "@vereine/shared";

export type Delimiter = ";" | "," | "\t";

/** Trennzeichen aus der Kopfzeile erraten (ausserhalb von Anfuehrungszeichen): ; vor , vor Tab bei Gleichstand. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch as Delimiter]++;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"] && counts[";"] > 0) return ";";
  if (counts[","] >= counts["\t"] && counts[","] > 0) return ",";
  return counts["\t"] > 0 ? "\t" : ";";
}

/**
 * Kleiner CSV-Parser nach RFC 4180: Felder in Anfuehrungszeichen duerfen Trennzeichen und Zeilenumbrueche enthalten,
 * "" steht fuer ein Anfuehrungszeichen. CRLF, LF und CR als Zeilenende. Leere Zeilen werden uebersprungen,
 * liefern aber ihre Zeilennummer mit (fuer Fehlermeldungen je Zeile). `maxRecords` bricht frueh ab.
 */
export function parseCsv(text: string, delimiter: Delimiter, maxRecords = Infinity): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let touched = false; // Zeile hat Inhalt (auch "" zaehlt)
  const endRecord = () => {
    cells.push(cell);
    if (touched || cells.length > 1 || cell !== "") out.push({ line: startLine, cells });
    cells = [];
    cell = "";
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
      touched = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
      touched = true;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      startLine = line;
      if (out.length >= maxRecords) return out;
    } else {
      cell += ch;
      if (ch.trim()) touched = true;
    }
  }
  if (cell !== "" || cells.length || touched) endRecord();
  return out;
}

/** Kopfzeile vereinheitlichen: klein, Umlaute ausgeschrieben, nur Buchstaben/Ziffern ("E-Mail-Adresse" -> "emailadresse"). */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<MemberImportField, string[]> = {
  firstName: ["vorname", "vornamen", "rufname", "firstname", "givenname"],
  lastName: ["nachname", "familienname", "zuname", "lastname", "surname", "familyname"],
  email: ["email", "emailadresse", "mail", "mailadresse", "emailaddress", "epost"],
  memberNo: ["mitgliedsnummer", "mitgliedsnr", "mitgliedernummer", "mitgliednr", "mitgliedernr", "mitgliednummer", "nr", "nummer", "memberno", "membernumber"],
  joinedOn: ["eintrittsdatum", "eintritt", "eintrittam", "beitritt", "beitrittsdatum", "mitgliedseit", "seit", "joinedon", "joindate"],
  feeClass: ["beitragsklasse", "beitragsgruppe", "beitragsart", "beitrag", "tarif", "feeclass"],
};

/** Spaltenzuordnung: erste passende Spalte je Feld; "Name" gilt als Nachname, wenn es "Vorname" gibt. */
export function mapColumns(headers: string[]): { index: Partial<Record<MemberImportField, number>>; ignored: string[] } {
  const norm = headers.map(normalizeHeader);
  const index: Partial<Record<MemberImportField, number>> = {};
  for (const field of Object.keys(ALIASES) as MemberImportField[]) {
    const i = norm.findIndex((n, idx) => ALIASES[field].includes(n) && !Object.values(index).includes(idx));
    if (i >= 0) index[field] = i;
  }
  if (index.lastName === undefined && index.firstName !== undefined) {
    const i = norm.findIndex((n, idx) => n === "name" && !Object.values(index).includes(idx));
    if (i >= 0) index.lastName = i;
  }
  const used = new Set(Object.values(index));
  const ignored = headers.filter((h, i) => !used.has(i) && h.trim()).map((h) => h.trim().slice(0, 60));
  return { index, ignored };
}

/** Datum aus TT.MM.JJJJ, T.M.JJ, JJJJ-MM-TT; null = leer, "invalid" = nicht erkennbar oder kein echtes Datum. */
export function parseDate(raw: string): string | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(v))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[3].length === 2) y += y > Number(String(new Date().getUTCFullYear()).slice(2)) ? 1900 : 2000;
  } else return "invalid";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1850) return "invalid";
  return date.toISOString().slice(0, 10);
}
