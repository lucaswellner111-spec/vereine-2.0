import { createOrgApi, expect, expectAccessible, lastMailApi, signupApi, test, unique } from "./fixtures";

test("Mitglieder per CSV importieren: Vorschau, Bestaetigen, Einladungsmail", async ({ page }, info) => {
  await signupApi(page.request, "Vorstand", info);
  await createOrgApi(page.request, `SV ${unique("Import", info)}`);
  const ok = `${unique("imp-ok", info)}@example.de`;
  const csv = ["Vorname;Nachname;E-Mail;Mitgliedsnummer;Eintritt", `Lea;"Meyer; jun.";${ok};4711;01.02.2021`, "Max;Fehler;keine-mail;;"].join("\r\n");

  await page.goto("/verwaltung/mitglieder");
  await page.getByRole("button", { name: "CSV-Import" }).click();
  await expect(page.getByRole("heading", { name: "Mitglieder per CSV importieren" })).toBeVisible();
  await page.getByLabel("CSV-Datei auswählen").setInputFiles({ name: "mitglieder.csv", mimeType: "text/csv", buffer: Buffer.from("﻿" + csv, "utf8") });

  await expect(page.getByRole("heading", { name: "Vorschau" })).toBeVisible();
  await expect(page.getByText("E-Mail-Adresse ist ungültig.")).toBeVisible();
  await expect(page.getByText("Meyer; jun.", { exact: false }).first()).toBeVisible();
  await expectAccessible(page, "Mitglieder-Import: Vorschau");

  await page.getByRole("button", { name: "1 Person einladen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Einladungen verschicken" }).click();
  await expect(page.getByRole("heading", { name: /Eingeladen, noch nicht beigetreten \(1\)/ })).toBeVisible();
  await expect(page.getByText(ok)).toBeVisible();

  const mail = await lastMailApi(page.request, ok, "member-invite");
  expect(mail.text).toContain("Hallo Lea,");
  expect(mail.text).toMatch(/\/einladung\/[A-Za-z0-9_-]+/);
});
