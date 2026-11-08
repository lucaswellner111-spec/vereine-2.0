import QRCode from "qrcode";
import { isValidIban } from "@vereine/shared";

/** Hoechstgroesse des EPC-QR-Inhalts (EPC069-12). */
export const GIROCODE_MAX_BYTES = 331;
const MIN_CENTS = 1;
const MAX_CENTS = 99_999_999_999; // 999.999.999,99 EUR

export type GiroCodeSource = {
  status: string;
  currency: string;
  issuerName: string;
  issuerIban: string;
  totalCents: number;
  number: string | null;
};

/** Zeilenumbrueche und Steuerzeichen entfernen (jedes Feld steht auf genau einer Zeile). */
const oneLine = (s: string) => s.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Inhalt des GiroCodes (EPC-QR, Version 002, UTF-8, BIC leer) aus der Rechnungskopie, oder null, wenn kein
 * Code gedruckt werden darf: nur offene Rechnungen in EUR mit gueltiger IBAN und Betrag 0,01–999.999.999,99.
 * Das letzte belegte Feld (Verwendungszweck) steht ohne abschliessenden Zeilenumbruch (EPC069-12).
 */
export function giroCodePayload(inv: GiroCodeSource): string | null {
  if (inv.status !== "open" || inv.currency !== "EUR" || !inv.number) return null;
  if (!Number.isInteger(inv.totalCents) || inv.totalCents < MIN_CENTS || inv.totalCents > MAX_CENTS) return null;
  const iban = inv.issuerIban.replace(/\s/g, "").toUpperCase();
  if (!iban || !isValidIban(iban)) return null;
  // SEPA-Zeichensatz: Umlaute (Latin-1) bleiben, alles andere wird "?"
  const name = [...oneLine(inv.issuerName).replace(/[^\x20-\x7E\xA0-\xFF]/gu, "?")].slice(0, 70).join("");
  if (!name) return null;
  const amount = `EUR${(inv.totalCents / 100).toFixed(2)}`;
  const text = [...oneLine(`Rechnung ${inv.number}`)].slice(0, 140).join("");
  const payload = ["BCD", "002", "1", "SCT", "", name, iban, amount, "", "", text].join("\n");
  return Buffer.byteLength(payload, "utf8") <= GIROCODE_MAX_BYTES ? payload : null;
}

/** QR-Matrix (Fehlerkorrektur M, wie vom EPC verlangt): Kantenlaenge und Abfrage dunkler Module. */
export function giroCodeMatrix(payload: string): { size: number; isDark: (row: number, col: number) => boolean } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const { size } = qr.modules;
  return { size, isDark: (row, col) => !!qr.modules.get(row, col) };
}
