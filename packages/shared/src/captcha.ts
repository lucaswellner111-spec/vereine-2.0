// Bot-Abwehr: selbst gehostetes Proof-of-Work-Captcha im Stil von ALTCHA (eigene Implementierung, kein Drittanbieter).

/** Header, in dem der Client die geloeste Aufgabe mitschickt (base64 von JSON). */
export const CAPTCHA_HEADER = "x-captcha";
export const CAPTCHA_FAILED_CODE = "CAPTCHA_FAILED";
export const CAPTCHA_FAILED_MESSAGE = "Die Sicherheitsprüfung ist abgelaufen oder fehlgeschlagen. Bitte versuche es noch einmal.";

export type CaptchaChallenge = {
  algorithm: "SHA-256";
  /** SHA-256 (hex) von `salt` + geheimer Zahl */
  challenge: string;
  /** Zufall plus `?expires=<Unix-Sekunden>` */
  salt: string;
  /** HMAC des Servers ueber challenge und salt */
  signature: string;
  /** Die gesuchte Zahl liegt zwischen 0 und maxnumber */
  maxnumber: number;
};

export type CaptchaSolution = Pick<CaptchaChallenge, "algorithm" | "challenge" | "salt" | "signature"> & { number: number };

/** false = Bot-Abwehr auf diesem Server aus (Entwicklung/Tests); das Web zeigt dann kein Widget und schickt nichts. */
export type CaptchaConfig = { enabled: boolean };
