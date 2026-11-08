import { PDFDocument, PDFPage } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceDetail } from "@vereine/shared";
import { GIROCODE_MAX_BYTES, giroCodeMatrix, giroCodePayload, type GiroCodeSource } from "./girocode";
import { buildInvoicePdf, GIROCODE_CAPTION } from "./invoice-pdf";

const IBAN = "DE89370400440532013000";
const base: GiroCodeSource = { status: "open", currency: "EUR", issuerName: "SV Grün-Weiß e. V.", issuerIban: "DE89 3704 0044 0532 0130 00", totalCents: 12050, number: "2027-0001" };

describe("GiroCode (EPC-QR)", () => {
  it("Inhalt Zeile fuer Zeile (Version 002, UTF-8, SCT, BIC leer)", () => {
    const lines = giroCodePayload(base)!.split("\n");
    expect(lines).toEqual(["BCD", "002", "1", "SCT", "", "SV Grün-Weiß e. V.", IBAN, "EUR120.50", "", "", "Rechnung 2027-0001"]);
  });

  it("Betragsformat mit Punkt und zwei Nachkommastellen, Grenzen 0,01 und 999.999.999,99", () => {
    const amount = (totalCents: number) => giroCodePayload({ ...base, totalCents })?.split("\n")[7] ?? null;
    expect(amount(1)).toBe("EUR0.01");
    expect(amount(100)).toBe("EUR1.00");
    expect(amount(123456789)).toBe("EUR1234567.89");
    expect(amount(99_999_999_999)).toBe("EUR999999999.99");
    expect(amount(0)).toBeNull();
    expect(amount(100_000_000_000)).toBeNull();
    expect(amount(12.5)).toBeNull();
  });

  it("entfernt Zeilenumbrueche aus Feldern und kuerzt den Namen auf 70 Zeichen", () => {
    const p = giroCodePayload({ ...base, issuerName: "Verein\r\nmit\tUmbruch", number: "2027-\n0002" })!;
    expect(p.split("\n")).toHaveLength(11);
    expect(p.split("\n")[5]).toBe("Verein mit Umbruch");
    expect(p.split("\n")[10]).toBe("Rechnung 2027- 0002");
    const long = giroCodePayload({ ...base, issuerName: "Ä".repeat(100) })!;
    expect(long.split("\n")[5]).toBe("Ä".repeat(70));
    expect(Buffer.byteLength(long, "utf8")).toBeLessThanOrEqual(GIROCODE_MAX_BYTES);
  });

  it("Name im SEPA-Zeichensatz: Umlaute bleiben, Zeichen ausserhalb Latin-1 werden ?", () => {
    const p = giroCodePayload({ ...base, issuerName: "Café Größe € 😀 Ünï" })!;
    expect(p.split("\n")[5]).toBe("Café Größe ? ? Ünï");
  });

  it("bleibt unter 331 Byte (UTF-8) und ergibt einen QR-Code", () => {
    const p = giroCodePayload({ ...base, issuerName: "ÿ".repeat(70) })!;
    expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(GIROCODE_MAX_BYTES);
    expect(Buffer.from(p, "utf8").toString("utf8")).toBe(p);
    const m = giroCodeMatrix(p);
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect(m.isDark(0, 0)).toBe(true); // Positionsmarke oben links
  });

  it("kein QR bei Entwurf, bezahlt, storniert, ohne/ungueltiger IBAN, anderer Waehrung, ohne Nummer oder Namen", () => {
    for (const status of ["draft", "paid", "void"]) expect(giroCodePayload({ ...base, status })).toBeNull();
    expect(giroCodePayload({ ...base, issuerIban: "" })).toBeNull();
    expect(giroCodePayload({ ...base, issuerIban: "DE00 1234 5678 9012 3456 78" })).toBeNull();
    expect(giroCodePayload({ ...base, currency: "CHF" })).toBeNull();
    expect(giroCodePayload({ ...base, number: null })).toBeNull();
    expect(giroCodePayload({ ...base, issuerName: " \n " })).toBeNull();
  });
});

describe("Rechnungs-PDF mit GiroCode", () => {
  const inv = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
    id: "i1", orgSlug: "sv", orgName: "SV", number: "2027-0001", status: "open", displayStatus: "open",
    recipientName: "Mia Muster", recipientUserId: "u1", issueDate: "2027-01-02", dueDate: "2027-02-01", totalCents: 12050, paidAt: null,
    recipientAddress: "Hauptstr. 5\n12345 Zahlstadt", issuerName: "SV Grün-Weiß e. V.", issuerCity: "Zahlstadt", issuerAddress: "Vereinsweg 1",
    issuerIban: IBAN, issuerTaxInfo: "", note: "", vatNote: "", netCents: 12050, vatCents: 0,
    items: [{ description: "Erwachsene 2027", quantity: 1, unitCents: 12050, vatRate: 0 }], voidReason: null, currency: "EUR", ...over,
  });
  afterEach(() => vi.restoreAllMocks());
  // Gezaehlt werden gezeichnete Rechtecke und die Beschriftung (Inhaltsstroeme sind komprimiert)
  const draw = async (i: InvoiceDetail) => {
    const rect = vi.spyOn(PDFPage.prototype, "drawRectangle");
    const txt = vi.spyOn(PDFPage.prototype, "drawText");
    const bytes = await buildInvoicePdf(i);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    const caption = txt.mock.calls.some((c) => c[0] === GIROCODE_CAPTION);
    const n = rect.mock.calls.length;
    vi.restoreAllMocks();
    return { rects: n, caption };
  };

  it("offene Rechnung: PDF entsteht mit QR-Rechtecken, ohne IBAN bzw. als Entwurf ohne", async () => {
    const withQr = await draw(inv());
    expect(withQr.rects).toBeGreaterThan(50);
    expect(withQr.caption).toBe(true);
    for (const other of [inv({ issuerIban: "" }), inv({ status: "draft", number: null }), inv({ status: "paid" }), inv({ status: "void", voidReason: "Fehler" }), inv({ issuerIban: "DE00 1234 5678 9012 3456 78" })]) {
      expect(await draw(other)).toEqual({ rects: 0, caption: false });
    }
  });
});
