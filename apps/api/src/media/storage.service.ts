import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Injectable } from "@nestjs/common";

/**
 * Dateispeicher fuer Medien. Heute: lokales Verzeichnis (Docker-Volume) - reicht fuer einen Server.
 * SKALIERUNG: Ab mehreren App-Servern oder grossen Datenmengen durch Hetzner Object Storage (S3) ersetzen;
 * nur diese Klasse aendert sich (Schnittstelle: put/get/remove).
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer | null>;
  abstract remove(prefix: string): Promise<void>;
}

@Injectable()
export class LocalStorage extends StorageService {
  private readonly root = resolve(process.env.MEDIA_DIR ?? join(process.cwd(), "data", "media"));

  /** Schluessel sind intern erzeugt (UUID/Variante); trotzdem Pfadausbruch hart ausschliessen. */
  private path(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + "/") && !full.startsWith(this.root + "\\")) throw new Error("Ungueltiger Speicherschluessel.");
    return full;
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async remove(prefix: string) {
    await rm(this.path(prefix), { recursive: true, force: true });
  }
}
