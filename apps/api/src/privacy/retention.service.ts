import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AuditService } from "../auth/audit.service";
import { EventsService } from "../events/events.service";
import { JobsService } from "../jobs/jobs.service";
import { MemberImportService } from "../members/member-import.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { PostsService } from "../posts/posts.service";
import { AuthService } from "../auth/auth.service";
import { SuppressionsService } from "../mail/suppressions.service";
import { WaitlistService } from "../waitlist/waitlist.service";
import { PrivacyService } from "./privacy.service";

export { RETENTION, RETENTION_BATCH } from "../common/retention";

type Step = "notifications" | "deletedPosts" | "auditLog" | "attendance" | "invites" | "authTokens" | "pendingAccounts" | "mailSuppressions" | "pendingMembers" | "waitlist";

/**
 * Taeglicher Aufraeumjob `privacy.retention`. Kennt keine Tabellen: jeder Bereich loescht seine eigenen Daten
 * (`purgeExpired`), Fristen in common/retention.ts. Schritte laufen unabhaengig; Fehler werden gesammelt.
 */
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly log = new Logger("Retention");

  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(OrgAdminService) private readonly invites: OrgAdminService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SuppressionsService) private readonly suppressions: SuppressionsService,
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(MemberImportService) private readonly memberImports: MemberImportService,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService,
  ) {}

  onModuleInit() {
    this.jobs.define("privacy.retention", async () => void (await this.runAll()));
    this.jobs.every("privacy.retention", 24 * 60 * 60 * 1000);
  }

  private steps(): [Step, () => Promise<number>][] {
    return [
      ["notifications", () => this.notifications.purgeExpired()],
      ["deletedPosts", () => this.posts.purgeExpired()],
      ["auditLog", () => this.audit.purgeExpired()],
      ["attendance", () => this.events.purgeExpiredAttendance()],
      ["invites", () => this.invites.purgeExpiredInvites()],
      ["authTokens", () => this.auth.purgeExpiredTokens()],
      ["pendingAccounts", () => this.privacy.erasePendingRegistrations()],
      ["mailSuppressions", () => this.suppressions.purgeExpired()],
      ["pendingMembers", () => this.memberImports.purgeExpired()],
      ["waitlist", () => this.waitlist.purgeExpired()],
    ];
  }

  /** Alle Schritte; ein fehlgeschlagener Schritt haelt die anderen nicht auf. Am Ende ein Fehler mit allen Namen. */
  async runAll(): Promise<Record<Step, number | null>> {
    const result = {} as Record<Step, number | null>;
    const failed: Step[] = [];
    for (const [name, run] of this.steps()) {
      try {
        result[name] = await run();
      } catch (err) {
        result[name] = null;
        failed.push(name);
        // Bei Abfragefehlern nur die Ursache (Drizzle haengt sonst SQL und Parameter an die Meldung)
        const e = err as Error & { cause?: Error };
        this.log.error(`Aufraeumen ${name} fehlgeschlagen: ${e?.cause?.message ?? e?.message ?? "Fehler"}`);
      }
    }
    // Nur Zahlen, keine IDs/Inhalte
    this.log.log(`Aufraeumen: ${Object.entries(result).map(([k, v]) => `${k}=${v ?? "Fehler"}`).join(", ")}`);
    if (failed.length) throw new Error(`Aufraeumen unvollstaendig: ${failed.join(", ")}`);
    return result;
  }
}
