# Zahlungsanbieter für Klubnest (Recherche Welle 0)

Stand: 13.11.2026. Alle Gebühren sind "zu prüfen" (öffentliche Listenpreise, keine Angebote). Keine Rechtsberatung; ZAG-Fragen müssen von einem Anwalt bestätigt werden.

## 1. Kurzfazit

- **Empfehlung Top 1: Mollie Connect (Client Links, Sub-Merchants je Verein).** Niederländisch (Amsterdam), DNB-lizenziertes E-Geld-/Zahlungsinstitut, SEPA-Lastschrift inkl. Mandate-API, Plattformgebühr per Application Fee, Vertrag zwischen Mollie und jedem Verein direkt, Preise öffentlich (0,35 EUR je SEPA-Lastschrift).
- **Rückfall: Adyen for Platforms** (niederländisch, unabhängig, Nonprofit-Onboarding in der EWR seit April 2026 ohne Mindestvolumen über Goodstack), aber schwerer und vermutlich teurer/Vertrieb nötig. Zweite Option nur für Lastschrift: GoCardless (Achtung: seit 01.09.2026 Teil von Mollie, also kein unabhängiger Rückfall).
- **Ehrlicher US-Bezug bei Mollie:** Investoren Blackstone Growth, General Atlantic, TCV (US-Fonds, Minderheits-/Finanzinvestoren), neben EQT, HMI, Alkeon. Das Unternehmen sitzt und verarbeitet in der EU. Ob das mit der Gründer-Vorgabe "kein US-Anbieter" vereinbar ist, muss der Gründer entscheiden. Unterauftragsverarbeiter außerhalb der EU sind laut Drittquelle möglich (nicht geprüft).

## 2. Vergleichstabelle

| Kriterium | Mollie Connect | GoCardless (Partner API) | Adyen for Platforms | Payone (+OPP) | Viva.com (ISV) | Nuvei |
|---|---|---|---|---|---|---|
| Sitz / Konzern | Amsterdam, NL; Investoren teils US | London, UK (nicht EU); seit 01.09.2026 Teil von Mollie; frz. Präsenz vermutet | Amsterdam, NL | Frankfurt; 60 % Worldline (FR), 40 % DSV (Sparkassen) | Griechenland (nicht verifiziert) | Montreal, CA; Advent (Boston, US) hält ca. 46 % |
| Plattformmodell | Connect: Client Links, Split Payments, Application Fees | Partner-API (OAuth), Merchants zahlen selbst; Partner-Fee optional | Platforms: Konten-/Verifikationsmodell, Fees | Marktplatzlösung mit OPP (seit Feb. 2026); Funds-Flow unklar | ISV-Programm, Connected-Merchant per API | nicht geprüft |
| SEPA-Lastschrift | Ja, Mandate-API, first payment via iDEAL/Karte etc., Abos | Kernprodukt | Ja, nur SEPA Core (kein B2B) | Ja, EPC-Regeln; EU-weit per Support freischalten | Nicht als Einzugsprodukt für ISV belegt | nicht geprüft |
| Gebühren (zu prüfen) | SEPA-LS 0,35 EUR; Karte EWR 1,80 % + 0,25 EUR; Überweisung 0,25 EUR; 0 EUR/Monat (Pro 20 EUR) [1] | Standard 1 % + 0,20 EUR, max. 2 EUR (national) [2]; Charity-Rabatt 25 % (Seite von 2022) [3] | nicht öffentlich; Nonprofit-Gebühren unklar | nicht öffentlich | nicht geprüft | nicht geprüft |
| Plattformgebühr | Application Fee (Mollie-Gebühr bleibt beim Verein), Split möglich; nicht mit Resell-Pricing kombinierbar [4] | Partner-Fee, Empfehlung max. 0,5 % [5] | Ja (Platforms) | unklar | ISV-Fee, bei Erstattung rückgängig | nicht geprüft |
| KYC Vereine | Mollie prüft selbst (Legal Entity, UBO); nur juristische Personen, keine Privatpersonen [6] | Merchant-Onboarding bei GoCardless | Nonprofits EWR über Goodstack, "Tage bis Wochen" (Adyen-Angabe) [7] | Identitäts- und Risikoprüfung nach Vertrag | per API | nicht geprüft |
| Dauer KYC | nicht dokumentiert (offen) | nicht geprüft | Adyen: "Tage/Wochen" statt Monate; ältere Seiten 4-8 Wochen/1-2 Monate | nicht geprüft | nicht geprüft | nicht geprüft |
| Testmodus ohne Firma | Wahrscheinlich ja (Test-Key vor Aktivierung laut Drittquellen, nicht in Mollie-Doku bestätigt) | Sandbox vorhanden (nicht geprüft) | Test-Account (nicht geprüft) | nicht geprüft | nicht geprüft | nicht geprüft |
| Gemeinnützigkeit | Kein Nonprofit-Tarif gefunden; Verein muss Rechtsform nachweisen | 25 % Rabatt für registrierte Charities in DE (Stand 2022, prüfen) | Goodstack-Verifizierung, kein Mindestvolumen | nichts gefunden | nichts gefunden | nichts gefunden |
| AVV/DSGVO | Mollie-DPA für EU (Mollie B.V.); Mollie ist für Finanzdaten teils eigener Verantwortlicher [8] | nicht geprüft; UK-Sitz (Angemessenheitsbeschluss prüfen) | nicht geprüft | nicht geprüft | nicht geprüft | nicht geprüft |

## 3. Anbieter im Einzelnen

**Mollie Connect.** Onboarding über Client Links: Klubnest übergibt Vereinsdaten (Name, Adresse, Registernummer, USt-ID), der Verein bestätigt per Code bei Mollie. Token-Exchange per OAuth, danach Profile und Zahlarten konfigurieren, Status über Capabilities `payments`/`settlements` [6]. Mollie hat einen direkten Vertrag mit jedem Sub-Merchant [9]. Lastschrift: Kunde, first payment (z. B. iDEAL), danach Mandat `directdebit`, On-demand oder Abo; Retry fünfmal täglich, Pre-Notification wird empfohlen [10]. Haftung: Bei Split Payments haftet die Plattform für nicht einziehbare Rückbuchungen/Erstattungen und muss Mollies Pflichtwortlaut zur Finanzdienstleister-Rolle zeigen [9].

**GoCardless.** Spezialist für Lastschrift, über Partner-API einbindbar, Sitz UK. Mollie hat GoCardless am 1.9.2026 übernommen [11]; Produkt- und Datenverarbeitungsänderungen sind offen. Preislich stark bei niedrigen Beträgen (Beitrag 50 EUR kostet 0,70 EUR), gedeckelt bei 2 EUR [2]. Whitelabel-Partner-Status nötig, um für Dritte einzuziehen (Abschnitt in Quelle unvollständig, prüfen) [5].

**Adyen for Platforms.** Technisch sehr stark, aber auf größere Plattformen ausgelegt. Nonprofit-Onboarding für EWR-Organisationen über Goodstack ohne Mindestvolumen (angekündigt April 2026) [7]. Adyen Giving (Spendenmodell, Adyen trägt Kosten) betrifft Händler-Spendenaktionen, nicht Vereinsbeiträge. Preise nicht öffentlich.

**Payone/OPP.** Deutsche Marke, Worldline (FR) Mehrheit. BaFin-Maßnahme 2025 zu einem Hochrisiko-Geschäftsteil (laut IT Finanzmagazin, Payone sagt eingestellt) [12]. Escrow-Modell von Payone bedeutet Geldfluss über Payone-Treuhand; ob OPP die Plattform aus dem Geldfluss hält, ist offen [13].

**Viva.com.** ISV-Programm und Marketplace-Lösung belegt [14]; SEPA-Einzug für Vereine nicht belegt. Weitere Prüfung nur bei Bedarf.

**Nuvei.** Kanadisch, seit 15.11.2024 privat, Advent (US) ca. 46 % [15]. Wegen US-Bezug und Enterprise-Fokus nicht empfohlen.

**Nicht recherchiert / nicht belegt:** SumUp (keine Quelle gefunden), Mangopay (nur Drittquellen: SEPA-LS 0,60 EUR in altem Prospekt, Plattformgebühr ab 249 EUR/Monat unbestätigt; Wallet-Modell würde Klubnest eher in den Geldfluss bringen). Stripe/PayPal bewusst ausgeschlossen (US).

## 4. ZAG-Abgrenzung (Hinweis, kein Rechtsrat)

- Mollie-Terms: Bei Split Payments bleibt die Plattform "owner of a Transaction" und weist Mollie an, Gelder aufzuteilen und Plattformgebühren abzuziehen [9]. Das ist näher am Geldfluss als reine Application Fee. Empfehlung: zunächst nur Application Fee (Verein zahlt Mollie-Gebühr direkt, Plattformgebühr wird von Mollie automatisch an Klubnest weitergeleitet [4]) und anwaltlich klären lassen, ob das ZAG-unkritisch ist.
- Zahlungen gehen immer auf das Mollie-Konto des Vereins, Auszahlung auf dessen Vereinskonto. Klubnest hält nie Kundengelder.
- Spenden: Zuwendungsbestätigung stellt der Verein aus; Klubnest muss dafür Spenderdaten (Name, Anschrift, Betrag, Datum) beim Verein bereitstellen. Mollie liefert sie nicht; Metadaten/Eigenerfassung nötig.

## 5. Empfehlung und nächste Schritte

1. Mollie Partner-Account anlegen, Test-Key prüfen, Connect-Terms und Preisblatt für Plattformen beim Mollie-Vertrieb anfragen (Nonprofit-Konditionen, KYC-Dauer, Entitätstypen).
2. Phase 1 nur Zahlung von Rechnungen und SEPA-Lastschrift (Beiträge) pro Verein; Spenden und Plattformgebühr später.
3. Rückfall: Adyen for Platforms über Vertrieb anfragen; für Lastschrift GoCardless nur nach Klärung der Mollie-Integration.

## 6. Offene Fragen

- Akzeptiert Mollie auch nicht eingetragene Vereine und e.V. ohne Gewerbe? Welche Dokumente (Vereinsregisterauszug, Freistellungsbescheid)? KYC-Dauer?
- Gibt es einen Nonprofit-Tarif bei Mollie? Rücklastschriftgebühr (Seite nennt keine)?
- Testmodus ohne Firma: in Mollie-Doku bestätigen (derzeit nur Drittquellen).
- Mollie-Subprozessoren außerhalb der EU und Rolle der US-Investoren: Gründer-Entscheidung zur Vorgabe "kein US-Anbieter".
- Sind Application Fee und/oder Split Payments ZAG-unkritisch (Anwalt)?
- Wird GoCardless nach der Übernahme technisch in Mollie integriert? Preise 2027?
- Wie kommt der Verein an die SEPA-Gläubiger-ID (Bundesbank), und wer ist im Mandat Gläubiger (Verein, nicht Klubnest)?
- Mangopay/SumUp/Viva bei Bedarf gezielt nachrecherchieren.

## Quellen

[1] Mollie Preise DE, abgerufen 13.11.2026: https://www.mollie.com/de/pricing
[2] GoCardless EU-Preise: https://gocardless.com/en-eu/pricing
[3] GoCardless Charity-Preise (Gültig ab 1.1.2022): https://gocardless.com/de-de/faq/haendler/preis-aenderung-wohltaetigkeitsorganisationen
[4] Mollie Connect: Monetize payments: https://docs.mollie.com/docs/connect-monetize-payments
[5] GoCardless Partner Integration Guide: https://developer.gocardless.com/partners/integration-checklist/
[6] Mollie Connect: Onboard merchants: https://docs.mollie.com/docs/connect-onboard-merchants
[7] Adyen: Onboard European nonprofits faster with Goodstack (April 2026): https://www.adyen.com/the-latest/onboard-european-nonprofits-faster-with-goodstack
[8] Mollie DPA: https://www.mollie.com/legal/data-processing-agreement
[9] Mollie Connect Terms: https://www.mollie.com/legal/mollie-connect-terms
[10] Mollie Recurring payments: https://docs.mollie.com/docs/recurring-payments
[11] Mollie schließt GoCardless-Übernahme ab (1.9.2026): https://fintech.global/2026/09/01/mollie-completes-gocardless-acquisition-to-expand-payments-offering/
[12] IT Finanzmagazin zu Payone: https://www.it-finanzmagazin.de/tag/payone
[13] Payone und OPP (12.2.2026): https://www.it-finanzmagazin.de/payone-und-opp-starten-gemeinsame-zahlungsloesung-fuer-online-marktplaetze-239896/ und Payone Onboarding: https://www.payone.com/DE-en/support/help/e-commerce-solutions/onboarding
[14] Viva ISV-Programm: https://developer.viva.com/isv-partner-program/
[15] Nuvei Take-private: https://www.mccarthy.ca/en/experience/nuvei-corporation-completes-its-us-6-3b-definitive-arrangement-agreement-to-be-taken-private-by-advent-international
[16] Mollie Investoren (Finextra/Loyens): https://finextra.com/newsarticle/38311/mollie-raises-665-million-at-a-valuation-of-54-billion
