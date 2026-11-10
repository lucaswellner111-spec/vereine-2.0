import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Database } from "../db/db.module";
import { JobsService } from "../jobs/jobs.service";

type LeaveHandler = (orgId: string, userId: string) => Promise<void>;
type OrgDeletedHandler = (orgId: string) => Promise<void>;
/** Beitritt ueber einen Einladungslink (z. B. persoenliche Einladung aus dem Mitglieder-Import). */
type InviteAcceptedHandler = (orgId: string, userId: string, inviteId: string) => Promise<void>;
/** Laeuft IN der Loesch-Transaktion (nur `tx` benutzen); optionaler Rueckgabewert laeuft nach dem Commit (z. B. Dateien). */
type OrgDeletingHandler = (orgId: string, tx: Database) => Promise<(() => Promise<void>) | void>;

/**
 * Kleiner Ereignis-Verteiler: Bereiche, die auf Austritte oder geloeschte Vereine reagieren muessen (z. B. Mitglieder-
 * verwaltung loescht personenbezogene Stammdaten), melden sich hier an. So kennt `orgs` die anderen Bereiche nicht.
 * Faellt ein Handler aus, laufen die anderen weiter; der ausgefallene wird als Job (mit Wiederholungen) nachgeholt,
 * damit z. B. die Loeschung von Stammdaten garantiert passiert.
 */
@Injectable()
export class OrgEvents implements OnModuleInit {
  private readonly log = new Logger("OrgEvents");
  private readonly leaveHandlers = new Map<string, LeaveHandler>();
  private readonly deletedHandlers = new Map<string, OrgDeletedHandler>();
  private readonly deletingHandlers: OrgDeletingHandler[] = [];
  private readonly acceptedHandlers = new Map<string, InviteAcceptedHandler>();

  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  onModuleInit() {
    this.jobs.define("orgs.leave-cleanup", async (d: { orgId: string; userId: string; handler: string }) => {
      const h = this.leaveHandlers.get(d.handler);
      if (h) await h(d.orgId, d.userId);
    });
    this.jobs.define("orgs.deleted-cleanup", async (d: { orgId: string; handler: string }) => {
      const h = this.deletedHandlers.get(d.handler);
      if (h) await h(d.orgId);
    });
    this.jobs.define("orgs.invite-accepted", async (d: { orgId: string; userId: string; inviteId: string; handler: string }) => {
      const h = this.acceptedHandlers.get(d.handler);
      if (h) await h(d.orgId, d.userId, d.inviteId);
    });
  }

  onLeave(name: string, handler: LeaveHandler) {
    this.leaveHandlers.set(name, handler);
  }

  onOrgDeleted(name: string, handler: OrgDeletedHandler) {
    this.deletedHandlers.set(name, handler);
  }

  onInviteAccepted(name: string, handler: InviteAcceptedHandler) {
    this.acceptedHandlers.set(name, handler);
  }

  /** Nach dem Commit des Beitritts aufrufen. Wirft nie. */
  async emitInviteAccepted(orgId: string, userId: string, inviteId: string): Promise<void> {
    for (const [name, h] of this.acceptedHandlers) {
      try {
        await h(orgId, userId, inviteId);
      } catch {
        this.log.error(`Beitritts-Handler ${name} fehlgeschlagen (Verein ${orgId}), wird als Job wiederholt.`);
        await this.retry("orgs.invite-accepted", { orgId, userId, inviteId, handler: name });
      }
    }
  }

  onOrgDeleting(handler: OrgDeletingHandler) {
    this.deletingHandlers.push(handler);
  }

  /** Nach dem Commit aufrufen. Wirft nie. */
  async emitLeave(orgId: string, userId: string): Promise<void> {
    for (const [name, h] of this.leaveHandlers) {
      try {
        await h(orgId, userId);
      } catch {
        this.log.error(`Austritt-Handler ${name} fehlgeschlagen (Verein ${orgId}), wird als Job wiederholt.`);
        await this.retry("orgs.leave-cleanup", { orgId, userId, handler: name });
      }
    }
  }

  /** Nach dem Commit der Vereinsloeschung aufrufen. Wirft nie. */
  async emitOrgDeleted(orgId: string): Promise<void> {
    for (const [name, h] of this.deletedHandlers) {
      try {
        await h(orgId);
      } catch {
        this.log.error(`Loesch-Handler ${name} fehlgeschlagen (Verein ${orgId}), wird als Job wiederholt.`);
        await this.retry("orgs.deleted-cleanup", { orgId, handler: name });
      }
    }
  }

  /** In der Loesch-Transaktion; Fehler brechen die Loeschung ab. Liefert Aufgaben fuer nach dem Commit. */
  async runDeleting(orgId: string, tx: Database): Promise<(() => Promise<void>)[]> {
    const after: (() => Promise<void>)[] = [];
    for (const h of this.deletingHandlers) {
      const cb = await h(orgId, tx);
      if (cb) after.push(cb);
    }
    return after;
  }

  private async retry(name: string, data: object) {
    try {
      await this.jobs.enqueue(name, data); // inline (Tests/lokal): sofort; BullMQ: 3 Versuche mit Backoff
    } catch {
      this.log.error(`Job ${name} fehlgeschlagen.`);
    }
  }
}
