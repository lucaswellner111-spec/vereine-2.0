import type { EventItem, FeedPost } from "@vereine/shared";
import { ask, toast } from "@/components/ui-hosts";
import { mediaUrl } from "./media";
import {
  coverCrop,
  eventWhen,
  fitText,
  STORY_H,
  STORY_PAD,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  STORY_W,
  storyFileName,
  truncateText,
  type Measure,
} from "./story";

/*
 * Story-Kachel im Browser per Canvas zeichnen und teilen. Bewusst clientseitig: private Inhalte verlassen das
 * Geraet nur, wenn die Person sie selbst teilt. Bilder nur ueber /api/media (same-origin, Canvas bleibt nutzbar).
 * Auf der Kachel stehen nur Vereinsname und Inhalt, keine Namen anderer Personen.
 */

const C = { from: "#0e4a2d", mid: "#1b6e45", to: "#0f7a5a", pop: "#c6f36b", ink: "#07140d", white: "#ffffff" };

type Ctx = CanvasRenderingContext2D;

function fontFamily(): string {
  const f = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  return f || "system-ui, sans-serif";
}

async function ensureFonts(family: string) {
  try {
    await Promise.all([document.fonts.load(`800 80px ${family}`), document.fonts.load(`600 40px ${family}`)]);
  } catch {
    // Systemschrift reicht
  }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function background(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, STORY_W, STORY_H);
  g.addColorStop(0, C.from);
  g.addColorStop(0.55, C.mid);
  g.addColorStop(1, C.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  // Limetten-Glanz oben rechts und unten links
  for (const [x, y, r, a] of [
    [STORY_W - 80, 220, 620, 0.32],
    [0, STORY_H - 160, 560, 0.18],
  ] as const) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `rgba(198, 243, 107, ${a})`);
    glow.addColorStop(1, "rgba(198, 243, 107, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  }
}

/** Markenzeile oben: „K“-Kachel + Klubnest */
function brand(ctx: Ctx, family: string) {
  const y = 150;
  roundRect(ctx, STORY_PAD, y, 84, 84, 22);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.fillStyle = C.mid;
  ctx.font = `800 54px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("K", STORY_PAD + 42, y + 45);
  ctx.textAlign = "left";
  ctx.fillStyle = C.white;
  ctx.font = `800 50px ${family}`;
  ctx.fillText("Klubnest", STORY_PAD + 110, y + 44);
}

function pill(ctx: Ctx, family: string, text: string, x: number, y: number) {
  ctx.font = `800 38px ${family}`;
  const w = ctx.measureText(text).width + 64;
  roundRect(ctx, x, y, w, 76, 38);
  ctx.fillStyle = C.pop;
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 32, y + 40);
}

/** Vereinsname unten (das Einzige, was auf eine Person/Gruppe verweist) + Fusszeile */
function footer(ctx: Ctx, family: string, orgName: string) {
  const y = STORY_H - STORY_SAFE_BOTTOM - 40;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 36px ${family}`;
  ctx.fillText("von", STORY_PAD, y - 64);
  const measure: Measure = (t, s) => ((ctx.font = `800 ${s}px ${family}`), ctx.measureText(t).width);
  const { fontSize, lines } = fitText(orgName, STORY_W - 2 * STORY_PAD, [60, 52, 44], measure, 1);
  ctx.font = `800 ${fontSize}px ${family}`;
  ctx.fillStyle = C.white;
  ctx.fillText(lines[0] ?? "", STORY_PAD, y);
  roundRect(ctx, STORY_PAD, y + 36, 120, 12, 6);
  ctx.fillStyle = C.pop;
  ctx.fill();
}

function drawLines(ctx: Ctx, lines: string[], x: number, y: number, lineHeight: number) {
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function newCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  return { canvas, ctx };
}

export async function renderEventStory(e: Pick<EventItem, "title" | "startsAt" | "endsAt" | "location" | "orgName" | "canceled">): Promise<HTMLCanvasElement> {
  const family = fontFamily();
  await ensureFonts(family);
  const { canvas, ctx } = newCanvas();
  background(ctx);
  brand(ctx, family);
  const w = STORY_W - 2 * STORY_PAD;
  let y = STORY_SAFE_TOP + 140;
  ctx.font = `140px ${family}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("📅", STORY_PAD - 6, y + 120);
  y += 200;
  pill(ctx, family, e.canceled ? "ABGESAGT" : "SAVE THE DATE", STORY_PAD, y);
  y += 150;
  const measure: Measure = (t, s) => ((ctx.font = `800 ${s}px ${family}`), ctx.measureText(t).width);
  const title = fitText(truncateText(e.title, 120), w, [124, 108, 96, 84, 72], measure, 4);
  ctx.font = `800 ${title.fontSize}px ${family}`;
  ctx.fillStyle = C.white;
  y = drawLines(ctx, title.lines, STORY_PAD, y + title.fontSize * 0.8, title.fontSize * 1.08) + 40;

  // Karte mit Datum/Uhrzeit/Ort
  const when = eventWhen(e.startsAt, e.endsAt);
  const rows: [string, string][] = [["🗓️", when.date], ["🕒", when.time], ...(e.location ? [["📍", truncateText(e.location, 60)] as [string, string]] : [])];
  const rowH = 104;
  const cardH = rows.length * rowH + 56;
  roundRect(ctx, STORY_PAD, y, w, cardH, 44);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const rowMeasure: Measure = (t, s) => ((ctx.font = `700 ${s}px ${family}`), ctx.measureText(t).width);
  rows.forEach(([icon, text], i) => {
    const ry = y + 28 + i * rowH + rowH / 2;
    ctx.textBaseline = "middle";
    ctx.font = `52px ${family}`;
    ctx.fillText(icon, STORY_PAD + 40, ry);
    const fitted = fitText(text, w - 180, [52, 46, 40], rowMeasure, 1);
    ctx.font = `700 ${fitted.fontSize}px ${family}`;
    ctx.fillStyle = C.white;
    ctx.fillText(fitted.lines[0] ?? "", STORY_PAD + 130, ry + 2);
  });
  footer(ctx, family, e.orgName);
  return canvas;
}

export async function renderPostStory(p: Pick<FeedPost, "body" | "media"> & { orgName: string }): Promise<HTMLCanvasElement> {
  const family = fontFamily();
  await ensureFonts(family);
  const img = p.media[0] ? await loadImage(mediaUrl(p.media[0].id, "medium")) : null;
  const { canvas, ctx } = newCanvas();
  background(ctx);
  brand(ctx, family);
  const w = STORY_W - 2 * STORY_PAD;
  let y = STORY_SAFE_TOP + 60;
  pill(ctx, family, "📣 NEU IM VEREIN", STORY_PAD, y);
  y += 130;
  if (img) {
    const h = 760;
    const crop = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 20;
    roundRect(ctx, STORY_PAD, y, w, h, 48);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, STORY_PAD, y, w, h, 48);
    ctx.clip();
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, STORY_PAD, y, w, h);
    ctx.restore();
    y += h + 70;
  } else {
    ctx.font = `150px ${family}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("💬", STORY_PAD - 6, y + 130);
    y += 230;
  }
  const body = truncateText(p.body, 400);
  if (body) {
    const measure: Measure = (t, s) => ((ctx.font = `800 ${s}px ${family}`), ctx.measureText(t).width);
    const maxLines = img ? 5 : 9;
    const sizes = img ? [60, 52, 46] : [88, 76, 66, 58, 50];
    const fitted = fitText(body, w, sizes, measure, maxLines);
    ctx.font = `800 ${fitted.fontSize}px ${family}`;
    ctx.fillStyle = C.white;
    drawLines(ctx, fitted.lines, STORY_PAD, y + fitted.fontSize * 0.8, fitted.fontSize * 1.18);
  }
  footer(ctx, family, p.orgName);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG fehlgeschlagen"))), "image/png"));

/** PNG ueber das Teilen-Menue des Geraets (Web Share mit Datei), sonst als Download. */
export async function shareStoryFile(canvas: HTMLCanvasElement, fileName: string, title: string): Promise<void> {
  const blob = await toBlob(canvas);
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      // sonst auf Download ausweichen
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success("Story-Bild gespeichert");
}

const STORY_HINT = "Auf der Story sehen es alle, denen du sie zeigst – wirklich teilen?";

export async function shareEventStory(e: EventItem): Promise<void> {
  if (e.visibility === "members" && !(await ask(`Dieser Termin ist nur für Mitglieder sichtbar. ${STORY_HINT}`, { title: "Als Story teilen", confirmLabel: "Trotzdem teilen" }))) return;
  try {
    const canvas = await renderEventStory(e);
    await shareStoryFile(canvas, storyFileName("termin", e.title, e.startsAt), e.title);
  } catch {
    toast.error("Story-Bild konnte nicht erstellt werden.");
  }
}

export async function sharePostStory(p: FeedPost): Promise<void> {
  if (!p.org) return;
  // Beitragsbilder zeigt Klubnest nur angemeldeten Personen (auch nicht auf der oeffentlichen Vereinsseite)
  if (p.media.length > 0 && !(await ask(`Das Bild ist nur für angemeldete Personen sichtbar. ${STORY_HINT}`, { title: "Als Story teilen", confirmLabel: "Trotzdem teilen" }))) return;
  try {
    const canvas = await renderPostStory({ body: p.body, media: p.media, orgName: p.org.name });
    await shareStoryFile(canvas, storyFileName("beitrag", p.org.name, p.createdAt), p.org.name);
  } catch {
    toast.error("Story-Bild konnte nicht erstellt werden.");
  }
}
