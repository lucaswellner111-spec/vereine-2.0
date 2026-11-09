/**
 * E-Mail-Vorlagen (Deutsch, Du-Form): Text + einfaches HTML ohne externe Ressourcen (keine Bilder, Fonts, Tracking-Pixel).
 * Alle Werte werden im HTML maskiert. Links baut der Aufrufer (absolute https-URL der Plattform).
 * Inhalte bleiben knapp: keine Beitrags-/Chattexte, keine Namen Dritter (ausser der einladenden Person).
 */
export type MailTemplates = {
  "verify-email": { name: string; link: string };
  "password-reset": { name: string; link: string; validMinutes: number };
  /** Registrierung mit schon vorhandener Adresse (statt Fehlermeldung, gegen Konto-Enumeration). */
  "account-exists": { name?: string; link: string; resetLink: string };
  /** Erneute Registrierung einer noch unbestaetigten Adresse: Passwort selbst festlegen (Reset-Link), nie ein mitgeschicktes. */
  "registration-complete": { name?: string; link: string; validMinutes: number };
  "email-change-confirm": { name: string; link: string };
  "email-change-notice": { name: string; newEmailMasked: string; link: string };
  invite: { orgName: string; link: string; inviterName?: string; unsubscribeLink?: string };
  "invoice-new": { name: string; orgName: string; number: string; amount: string; dueDate: string; link: string };
  "notification-digest": { name: string; lines: string[]; link: string; unsubscribeLink?: string };
};
export type MailTemplate = keyof MailTemplates;
export const MAIL_TEMPLATES: MailTemplate[] = [
  "verify-email",
  "password-reset",
  "account-exists",
  "registration-complete",
  "email-change-confirm",
  "email-change-notice",
  "invite",
  "invoice-new",
  "notification-digest",
];

/**
 * Art je Vorlage: `critical` darf das globale Kontingent bis 100 % nutzen (sonst 80 %); `category` steuert Sperrliste
 * und Verhalten bei vollem Kontingent (auth/notice: verwerfen, service/invite: auf den naechsten Tag verschieben,
 * digest: verwerfen, die naechste Sammelmail kommt ohnehin).
 */
export const TEMPLATE_META: Record<MailTemplate, { priority: "critical" | "normal"; category: "auth" | "notice" | "service" | "invite" | "digest" }> = {
  "verify-email": { priority: "critical", category: "auth" },
  "password-reset": { priority: "critical", category: "auth" },
  "email-change-confirm": { priority: "critical", category: "auth" },
  "email-change-notice": { priority: "critical", category: "notice" },
  "account-exists": { priority: "normal", category: "notice" },
  "registration-complete": { priority: "critical", category: "auth" },
  invite: { priority: "normal", category: "invite" },
  "invoice-new": { priority: "normal", category: "service" },
  "notification-digest": { priority: "normal", category: "digest" },
};

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

type ComposeOpts = { list?: string[]; unsubscribe?: string };

/** Baut Text und HTML aus Absaetzen und einem Aktions-Link (optional Aufzaehlung und Abmeldelink). */
function compose(subject: string, greeting: string, paragraphs: string[], action: { label: string; link: string }, footer: string, opts: ComposeOpts = {}): RenderedMail {
  const link = safeLink(action.link);
  const unsubscribe = opts.unsubscribe ? safeLink(opts.unsubscribe) : null;
  const list = opts.list ?? [];
  const text = [
    greeting,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(list.length ? [...list.map((l) => `- ${l}`), ""] : []),
    `${action.label}: ${link}`,
    "",
    footer,
    ...(unsubscribe ? ["", `Keine solchen E-Mails mehr? Abmelden: ${unsubscribe}`] : []),
    "",
    `– Dein ${BRAND}-Team`,
  ].join("\n");
  const p = (s: string) => `<p style="margin:0 0 16px">${escapeHtml(s)}</p>`;
  const small = (s: string) => `<p style="margin:0 0 16px;font-size:13px;color:#5c5c58">${s}</p>`;
  const html = [
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f6f6f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1b;line-height:1.5">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">`,
    p(greeting),
    ...paragraphs.map(p),
    ...(list.length ? [`<ul style="margin:0 0 16px;padding-left:20px">${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`] : []),
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f6f50;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px">${escapeHtml(action.label)}</a></p>`,
    small(`Falls der Knopf nicht funktioniert, kopiere diesen Link in deinen Browser:<br>${escapeHtml(link)}`),
    small(escapeHtml(footer)),
    ...(unsubscribe ? [small(`Keine solchen E-Mails mehr? <a href="${escapeHtml(unsubscribe)}" style="color:#5c5c58">Abmelden</a>`)] : []),
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
        [`schön, dass du bei ${BRAND} bist! Bitte bestätige noch kurz deine E-Mail-Adresse. Der Link ist 24 Stunden gültig.`],
        { label: "E-Mail-Adresse bestätigen", link: d.link },
        `Du hast dich nicht registriert? Dann ignoriere diese E-Mail einfach – ohne Bestätigung passiert nichts.`,
      );
    }
    case "password-reset": {
      const d = data as MailTemplates["password-reset"];
      return compose(
        `Passwort zurücksetzen`,
        hello(d.name),
        [
          `du hast angefordert, dein Passwort zurückzusetzen. Der Link ist ${d.validMinutes} Minuten gültig und funktioniert nur einmal.`,
          `Danach wirst du auf allen Geräten abgemeldet.`,
        ],
        { label: "Neues Passwort festlegen", link: d.link },
        `Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.`,
      );
    }
    case "account-exists": {
      const d = data as MailTemplates["account-exists"];
      return compose(
        `Du hast schon ein Konto bei ${BRAND}`,
        hello(d.name),
        [
          `gerade wollte jemand – vielleicht du – mit dieser E-Mail-Adresse ein neues Konto erstellen. Für diese Adresse gibt es aber schon ein Konto.`,
          `Melde dich einfach an. Passwort vergessen? Dann setze es hier zurück: ${safeLink(d.resetLink)}`,
        ],
        { label: "Zur Anmeldung", link: d.link },
        `Du warst das nicht? Dann ignoriere diese E-Mail – an deinem Konto hat sich nichts geändert.`,
      );
    }
    case "registration-complete": {
      const d = data as MailTemplates["registration-complete"];
      return compose(
        `Registrierung abschließen`,
        hello(d.name),
        [
          `gerade wurde mit dieser E-Mail-Adresse erneut ein Konto bei ${BRAND} angefragt. Die Adresse ist noch nicht bestätigt.`,
          `Leg hier dein Passwort fest, damit ist die Registrierung abgeschlossen. Der Link ist ${d.validMinutes} Minuten gültig und funktioniert nur einmal.`,
        ],
        { label: "Passwort festlegen", link: d.link },
        `Du warst das nicht? Dann ignoriere diese E-Mail – ohne deinen Klick passiert nichts.`,
      );
    }
    case "email-change-confirm": {
      const d = data as MailTemplates["email-change-confirm"];
      return compose(
        `Bestätige deine neue E-Mail-Adresse`,
        hello(d.name),
        [`du möchtest diese Adresse für dein ${BRAND}-Konto verwenden. Bitte bestätige das innerhalb von 24 Stunden.`],
        { label: "Neue Adresse bestätigen", link: d.link },
        `Du hast das nicht angefordert? Dann ignoriere diese E-Mail – ohne Bestätigung bleibt alles, wie es ist.`,
      );
    }
    case "email-change-notice": {
      const d = data as MailTemplates["email-change-notice"];
      return compose(
        `Deine E-Mail-Adresse soll geändert werden`,
        hello(d.name),
        [
          `für dein ${BRAND}-Konto wurde eine neue E-Mail-Adresse angegeben (${d.newEmailMasked}). Die neue Adresse gilt erst, wenn sie über den Link in der Mail an die neue Adresse bestätigt wird.`,
          `Warst du das nicht? Dann setze sofort dein Passwort zurück – damit werden alle Geräte abgemeldet.`,
        ],
        { label: "Passwort zurücksetzen", link: d.link },
        `Diese Nachricht bekommst du aus Sicherheitsgründen an deine bisherige Adresse.`,
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
        { unsubscribe: d.unsubscribeLink },
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
    case "notification-digest": {
      const d = data as MailTemplates["notification-digest"];
      return compose(
        `Neues bei ${BRAND}`,
        hello(d.name),
        [`seit deiner letzten Sammelmail ist bei ${BRAND} Folgendes für dich passiert:`],
        { label: "Benachrichtigungen ansehen", link: d.link },
        `Du bekommst diese Mail höchstens einmal am Tag, weil du die Sammelmail in den Einstellungen eingeschaltet hast.`,
        { list: d.lines, unsubscribe: d.unsubscribeLink },
      );
    }
  }
  throw new Error("Unbekannte Mail-Vorlage.");
}

/** Adresse fuer Hinweise maskieren: "lena.mueller@example.de" -> "l***@example.de". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
