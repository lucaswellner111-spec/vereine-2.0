import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceDetail } from "@vereine/shared";

/** Betrag in Cent als "1.234,56 €". */
export const formatEur = (cents: number) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const formatDate = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "–");

/** Standardschriften (WinAnsi) decken deutsche Umlaute und das Euro-Zeichen ab; andere Zeichen werden ersetzt. */
const safe = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF€„“”–]/g, "?").replace(/[\r\n]+/g, " ");

const MARGIN = 56;
const PAGE = { w: 595.28, h: 841.89 }; // A4

/** Erzeugt die Rechnung als PDF (ohne Fremdressourcen). Entwuerfe sind als solche gekennzeichnet. */
export async function buildInvoicePdf(inv: InvoiceDetail): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Rechnung ${inv.number ?? "(Entwurf)"}`);
  doc.setProducer("Klubnest");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;
  const grey = rgb(0.4, 0.4, 0.4);

  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) =>
    p.drawText(safe(s), { x, y: yy, size, font, color });
  const right = (p: PDFPage, s: string, xRight: number, yy: number, size: number, font: PDFFont) =>
    p.drawText(safe(s), { x: xRight - font.widthOfTextAtSize(safe(s), size), y: yy, size, font });

  // Kopf: Aussteller
  text(page, inv.issuerName, MARGIN, y, 14, bold);
  y -= 16;
  if (inv.issuerCity) text(page, inv.issuerCity, MARGIN, y, 10, regular, grey);
  y -= 40;

  // Empfaenger
  text(page, inv.recipientName, MARGIN, y, 11, bold);
  y -= 14;
  for (const line of inv.recipientAddress.split(/\r?\n/).filter(Boolean).slice(0, 4)) {
    text(page, line, MARGIN, y, 10, regular);
    y -= 13;
  }

  // Titel und Metadaten
  y = Math.min(PAGE.h - MARGIN - 110, y - 30);
  text(page, inv.status === "draft" ? "RECHNUNG (ENTWURF)" : "RECHNUNG", MARGIN, y, 18, bold);
  if (inv.status === "void") text(page, "STORNIERT", PAGE.w - MARGIN - 90, y, 14, bold, rgb(0.75, 0.1, 0.1));
  y -= 22;
  const meta: [string, string][] = [
    ["Rechnungsnummer", inv.number ?? "–"],
    ["Rechnungsdatum", formatDate(inv.issueDate)],
    ["Fällig am", formatDate(inv.dueDate)],
  ];
  for (const [k, v] of meta) {
    text(page, k, MARGIN, y, 10, regular, grey);
    text(page, v, MARGIN + 120, y, 10, regular);
    y -= 14;
  }
  y -= 16;

  // Tabellenkopf
  // Rechte Kanten der Spalten (Text ist rechtsbuendig); die Beschreibung nutzt den Platz links davon.
  const col = { desc: MARGIN, qty: 300, unit: 385, vat: 440, total: PAGE.w - MARGIN };
  const header = (p: PDFPage, yy: number) => {
    text(p, "Beschreibung", col.desc, yy, 9, bold, grey);
    right(p, "Menge", col.qty, yy, 9, bold);
    right(p, "Einzelpreis", col.unit, yy, 9, bold);
    right(p, "USt", col.vat, yy, 9, bold);
    right(p, "Netto", col.total, yy, 9, bold);
    p.drawLine({ start: { x: MARGIN, y: yy - 5 }, end: { x: PAGE.w - MARGIN, y: yy - 5 }, thickness: 0.6, color: grey });
  };
  header(page, y);
  y -= 22;

  for (const it of inv.items) {
    if (y < MARGIN + 140) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
      header(page, y);
      y -= 22;
    }
    const desc = safe(it.description);
    // Einfacher Zeilenumbruch bei langen Beschreibungen
    const maxW = col.qty - col.desc - 50;
    const lines: string[] = [];
    let cur = "";
    for (const word of desc.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (regular.widthOfTextAtSize(next, 10) > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => text(page, l, col.desc, y - i * 12, 10, regular));
    right(page, String(it.quantity), col.qty, y, 10, regular);
    right(page, formatEur(it.unitCents), col.unit, y, 10, regular);
    right(page, `${it.vatRate} %`, col.vat, y, 10, regular);
    right(page, formatEur(it.quantity * it.unitCents), col.total, y, 10, regular);
    y -= Math.max(1, Math.min(3, lines.length)) * 12 + 6;
  }

  // Summen
  y -= 6;
  page.drawLine({ start: { x: 340, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 0.6, color: grey });
  y -= 16;
  const sums: [string, string, PDFFont][] = [
    ["Netto", formatEur(inv.netCents), regular],
    ["Umsatzsteuer", formatEur(inv.vatCents), regular],
    ["Gesamtbetrag", formatEur(inv.totalCents), bold],
  ];
  for (const [k, v, f] of sums) {
    text(page, k, 340, y, f === bold ? 11 : 10, f);
    right(page, v, col.total, y, f === bold ? 11 : 10, f);
    y -= 16;
  }

  // Hinweise
  y -= 14;
  const notes = [inv.vatNote, inv.note].filter(Boolean);
  for (const n of notes) {
    for (const line of safe(n).match(/.{1,95}(\s|$)/g) ?? []) {
      text(page, line.trim(), MARGIN, y, 9, regular, grey);
      y -= 12;
    }
    y -= 4;
  }
  if (inv.status === "void" && inv.voidReason) {
    text(page, `Storniert: ${inv.voidReason}`, MARGIN, y, 9, regular, rgb(0.75, 0.1, 0.1));
  }

  // Fusszeile
  for (const p of doc.getPages()) {
    text(p, `${inv.issuerName} · erstellt mit Klubnest`, MARGIN, 30, 8, regular, grey);
  }
  return doc.save();
}
