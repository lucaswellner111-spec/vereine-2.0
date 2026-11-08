/**
 * E-Mail-Vorlagen (Deutsch, Du-Form): Text + einfaches HTML ohne externe Ressourcen (keine Bilder, Fonts, Tracking-Pixel).
 * Alle Werte werden im HTML maskiert. Links baut der Aufrufer (absolute https-URL der Plattform).
 */
export type MailTemplates = {
  "verify-email": { name: string; link: string };
  "password-reset": { name: string; link: string; validMinutes: number };
  invite: { orgName: string; link: string; inviterName?: string };
  "invoice-new": { name: string; orgName: string; number: string; amount: string; dueDate: string; link: string };
};
export type MailTemplate = keyof MailTemplates;
export const MAIL_TEMPLATES: MailTemplate[] = ["verify-email", "password-reset", "invite", "invoice-new"];

export type RenderedMail = { subject: string; text: string; html: string };

const BRAND = "Klubnest";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function safeLink(link: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("Mail-Vorlage: ungueltiger Link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Mail-Vorlage: Link muss http(s) sein.");
  return url.toString();
}

/** Baut Text und HTML aus Absaetzen und einem Aktions-Link. */
function compose(subject: string, greeting: string, paragraphs: string[], action: { label: string; link: string }, footer: string): RenderedMail {
  const link = safeLink(action.link);
  const text = [greeting, "", ...paragraphs.flatMap((p) => [p, ""]), `${action.label}: ${link}`, "", footer, "", `– Dein ${BRAND}-Team`].join("\n");
  const p = (s: string) => `<p style="margin:0 0 16px">${escapeHtml(s)}</p>`;
  const html = [
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f6f6f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1b;line-height:1.5">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">`,
    p(greeting),
    ...paragraphs.map(p),
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f6f50;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px">${escapeHtml(action.label)}</a></p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#5c5c58">Falls der Knopf nicht funktioniert, kopiere diesen Link in deinen Browser:<br>${escapeHtml(link)}</p>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#5c5c58">${escapeHtml(footer)}</p>`,
    `<p style="margin:0">– Dein ${BRAND}-Team</p>`,
    `</div></body></html>`,
  ].join("");
  return { subject, text, html };
}

const hello = (name?: string) => (name?.trim() ? `Hallo ${name.trim()},` : "Hallo,");

export function renderMail<T extends MailTemplate>(template: T, data: MailTemplates[T]): RenderedMail {
  switch (template) {
    case "verify-email": {
      const d = data as MailTemplates["verify-email"];
      return compose(
        `Bitte bestätige deine E-Mail-Adresse`,
        hello(d.name),
        [`schön, dass du bei ${BRAND} bist! Bitte bestätige noch kurz deine E-Mail-Adresse.`],
        { label: "E-Mail-Adresse bestätigen", link: d.link },
        `Du hast dich nicht registriert? Dann ignoriere diese E-Mail einfach – ohne Bestätigung passiert nichts.`,
      );
    }
    case "password-reset": {
      const d = data as MailTemplates["password-reset"];
      return compose(
        `Passwort zurücksetzen`,
        hello(d.name),
        [`du hast angefordert, dein Passwort zurückzusetzen. Der Link ist ${d.validMinutes} Minuten gültig und funktioniert nur einmal.`],
        { label: "Neues Passwort festlegen", link: d.link },
        `Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.`,
      );
    }
    case "invite": {
      const d = data as MailTemplates["invite"];
      const inviter = d.inviterName?.trim();
      return compose(
        `Einladung zu ${d.orgName}`,
        hello(),
        [inviter ? `${inviter} lädt dich zu „${d.orgName}“ bei ${BRAND} ein.` : `Du wurdest zu „${d.orgName}“ bei ${BRAND} eingeladen.`],
        { label: "Einladung ansehen", link: d.link },
        `Du kennst den Verein nicht? Dann ignoriere diese E-Mail einfach.`,
      );
    }
    case "invoice-new": {
      const d = data as MailTemplates["invoice-new"];
      return compose(
        `Neue Rechnung von ${d.orgName}`,
        hello(d.name),
        [`${d.orgName} hat dir die Rechnung ${d.number} über ${d.amount} gestellt, fällig am ${d.dueDate}.`, `Die Rechnung findest du als PDF in deinem Konto.`],
        { label: "Rechnung ansehen", link: d.link },
        `Fragen zur Rechnung beantwortet dir dein Verein.`,
      );
    }
  }
  throw new Error("Unbekannte Mail-Vorlage.");
}
