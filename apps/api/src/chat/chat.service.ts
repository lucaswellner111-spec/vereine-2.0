import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type {
  ChatContact,
  ChatEvent,
  ChatReportItem,
  ChatMessage,
  ConversationDetail,
  ConversationMember,
  ConversationSummary,
  CreateConversationInput,
  MessagePage,
  PublicUser,
  ReportInput,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB, type Database } from "../db/db.module";
import { chatBlocks, conversationMembers, conversations, messageReports, messages } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { OrgsService } from "../orgs/orgs.service";
import { ChatCrypto } from "./chat-crypto.service";
import { REALTIME_BUS, type RealtimeBus } from "./realtime-bus";

const PAGE = 30;
const RATE_LIMIT_PER_MIN = 30;
const DELETED_USER = "Gelöschter Nutzer";
const defaultRetentionDays = () => Number(process.env.CHAT_DEFAULT_RETENTION_DAYS ?? 365);

type Conv = typeof conversations.$inferSelect;
type Cursor = { ts: string; id: string };
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decode(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (typeof c.ts === "string" && typeof c.id === "string") return c;
  } catch {
    /* ungueltig */
  }
  throw new BadRequestException("Ungueltiger Cursor.");
}
const aad = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`;

/**
 * Chat-Bereich (Schema `chat`). Keine Fremdschluessel auf andere Bereiche; Nutzernamen ueber UsersDirectory,
 * Kontaktregeln ueber OrgsService. Inhalte liegen nur verschluesselt in der Datenbank (siehe ChatCrypto).
 *
 * SKALIERUNG: Nachrichten-Index (conversation_id, created_at, id) mit Keyset-Paging. Zustellung ueber Redis
 * Pub/Sub (nur IDs). Ab ~50k Nutzern: Tabelle `messages` nach Monat partitionieren, Chat-Datenbank auf eigenen
 * Server (Schema ist bereits getrennt), Gateway horizontal skalieren.
 */
@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(ChatCrypto) private readonly crypto: ChatCrypto,
    @Inject(REALTIME_BUS) private readonly bus: RealtimeBus,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.jobs.define("chat.retention", async () => void (await this.purgeExpired()));
    this.jobs.every("chat.retention", 60 * 60 * 1000);
    this.jobs.define("chat.rewrap-keys", async () => void (await this.rewrapKeys()));
  }

  // --- Unterhaltungen anlegen -------------------------------------------------

  async contacts(user: PublicUser): Promise<ChatContact[]> {
    const candidates = await this.orgs.contactCandidates(user.id);
    const blocked = await this.blockedBetween(user.id, candidates.map((c) => c.userId));
    const visible = candidates.filter((c) => !blocked.has(c.userId));
    const names = await this.directory.names(visible.map((c) => c.userId));
    return visible
      .map((c) => ({ userId: c.userId, name: names.get(c.userId) ?? DELETED_USER, context: c.context }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  async create(user: PublicUser, input: CreateConversationInput): Promise<ConversationDetail> {
    return input.kind === "direct" ? this.createDirect(user, input.userId) : this.createGroup(user, input);
  }

  private async createDirect(user: PublicUser, otherId: string): Promise<ConversationDetail> {
    if (otherId === user.id) throw new BadRequestException("Du kannst dir nicht selbst schreiben.");
    const names = await this.directory.names([otherId]);
    if (!names.has(otherId)) throw new NotFoundException("Nutzer nicht gefunden.");
    if ((await this.blockedBetween(user.id, [otherId])).has(otherId)) throw new ForbiddenException("Du kannst diesem Nutzer nicht schreiben.");

    const directKey = [user.id, otherId].sort().join(":");
    const [existing] = await this.db.select().from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
    if (existing) {
      // Bereits vorhanden: nur fuer Beteiligte zugaenglich, ansonsten gilt die Kontaktregel unveraendert.
      await this.requireMember(existing.id, user.id);
      return this.detail(user, existing.id);
    }
    if (!(await this.orgs.canContact(user.id, otherId))) {
      throw new ForbiddenException("Ihr habt keinen gemeinsamen Verein. Direktnachrichten sind nur unter Vereinsmitgliedern oder an den Vorstand eines Vereins moeglich, dem du folgst.");
    }
    const { wrapped, version } = this.crypto.wrap(this.crypto.newDataKey());
    const [conv] = await this.db
      .insert(conversations)
      .values({ kind: "direct", createdBy: user.id, directKey, wrappedKey: wrapped, keyVersion: version })
      .returning();
    await this.db.insert(conversationMembers).values([
      { conversationId: conv.id, userId: user.id, role: "member" },
      { conversationId: conv.id, userId: otherId, role: "member" },
    ]);
    await this.publish([user.id, otherId], { type: "conversation", conversationId: conv.id });
    return this.detail(user, conv.id);
  }

  private async createGroup(user: PublicUser, input: Extract<CreateConversationInput, { kind: "group" }>): Promise<ConversationDetail> {
    const org = await this.orgs.requireBySlug(input.orgSlug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (role !== "admin" && role !== "moderator") throw new ForbiddenException("Nur Vorstand und Moderation duerfen Gruppen-Chats anlegen.");
    const wanted = [...new Set(input.memberIds)].filter((id) => id !== user.id);
    const valid = await this.orgs.activeMemberIds(org.id, wanted);
    if (valid.length !== wanted.length) throw new BadRequestException("Alle Mitglieder muessen aktive Mitglieder des Vereins sein.");

    const { wrapped, version } = this.crypto.wrap(this.crypto.newDataKey());
    const [conv] = await this.db
      .insert(conversations)
      .values({ kind: "group", title: input.title, orgId: org.id, createdBy: user.id, wrappedKey: wrapped, keyVersion: version })
      .returning();
    await this.db.insert(conversationMembers).values([
      { conversationId: conv.id, userId: user.id, role: "owner" },
      ...valid.map((id) => ({ conversationId: conv.id, userId: id, role: "member" })),
    ]);
    await this.publish([user.id, ...valid], { type: "conversation", conversationId: conv.id });
    return this.detail(user, conv.id);
  }

  // --- Lesen -------------------------------------------------------------------

  async list(user: PublicUser): Promise<ConversationSummary[]> {
    const rows = await this.db
      .select({ conv: conversations, lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(eq(conversationMembers.userId, user.id))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
      .limit(200);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.conv.id);

    const [unreadRows, lastRows, memberRows] = await Promise.all([
      this.db
        .select({ id: messages.conversationId, n: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(
          conversationMembers,
          and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, user.id)),
        )
        .where(
          and(
            inArray(messages.conversationId, ids),
            ne(messages.senderId, user.id),
            sql`${messages.deletedAt} is null`,
            sql`${messages.createdAt} > ${conversationMembers.lastReadAt}`,
          ),
        )
        .groupBy(messages.conversationId),
      this.db
        .selectDistinctOn([messages.conversationId], {
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          ciphertext: messages.ciphertext,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(messages.conversationId, desc(messages.createdAt), desc(messages.id)),
      this.db
        .select({ conversationId: conversationMembers.conversationId, userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(inArray(conversationMembers.conversationId, rows.filter((r) => r.conv.kind === "direct").map((r) => r.conv.id)), ne(conversationMembers.userId, user.id))),
    ]);
    const unread = new Map(unreadRows.map((r) => [r.id, r.n]));
    const last = new Map(lastRows.map((r) => [r.conversationId, r]));
    const otherOf = new Map(memberRows.map((m) => [m.conversationId, m.userId]));
    const names = await this.directory.names([...otherOf.values()]);
    const slugs = await this.orgSlugs(rows.map((r) => r.conv.orgId));

    return rows.map(({ conv }) => {
      const l = last.get(conv.id);
      const key = this.crypto.unwrap(conv.wrappedKey, conv.keyVersion);
      const preview = l ? (l.deletedAt ? "Nachricht gelöscht" : this.crypto.decrypt(key, l.ciphertext, aad(conv.id, l.id)).slice(0, 80)) : "";
      const other = otherOf.get(conv.id);
      return {
        id: conv.id,
        kind: conv.kind as "direct" | "group",
        title: conv.kind === "group" ? conv.title ?? "Gruppe" : (other ? names.get(other) : undefined) ?? DELETED_USER,
        orgSlug: conv.orgId ? slugs.get(conv.orgId) ?? null : null,
        unread: unread.get(conv.id) ?? 0,
        lastMessage: l ? { preview, createdAt: l.createdAt.toISOString(), mine: l.senderId === user.id } : null,
        lastActivityAt: (conv.lastMessageAt ?? conv.createdAt).toISOString(),
      };
    });
  }

  async detail(user: PublicUser, id: string): Promise<ConversationDetail> {
    const conv = await this.requireMember(id, user.id);
    const members = await this.db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, id));
    const names = await this.directory.names(members.map((m) => m.userId));
    const list: ConversationMember[] = members
      .map((m) => ({ userId: m.userId, name: names.get(m.userId) ?? DELETED_USER, role: m.role as "owner" | "member" }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const summary = (await this.list(user)).find((s) => s.id === id)!;
    const other = conv.kind === "direct" ? members.find((m) => m.userId !== user.id) : undefined;
    return {
      ...summary,
      members: list,
      retentionDays: conv.retentionDays,
      effectiveRetentionDays: conv.retentionDays ?? defaultRetentionDays(),
      iAmOwner: members.some((m) => m.userId === user.id && m.role === "owner"),
      blocked: other ? (await this.blockedBetween(user.id, [other.userId])).has(other.userId) : false,
    };
  }

  async messages(user: PublicUser, id: string, cursor?: string): Promise<MessagePage> {
    const conv = await this.requireMember(id, user.id);
    const after = decode(cursor);
    const rows = await this.db
      .select({ m: messages, ts: sql<string>`${messages.createdAt}::text` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, id),
          after ? sql`(${messages.createdAt}, ${messages.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(PAGE + 1);
    const page = rows.slice(0, PAGE);
    const names = await this.directory.names(page.map((r) => r.m.senderId));
    const key = this.crypto.unwrap(conv.wrappedKey, conv.keyVersion);
    const last = page[page.length - 1];
    return {
      messages: page
        .map(({ m }) => this.toMessage(m, key, conv.id, user.id, names))
        .reverse(), // aelteste zuerst
      nextCursor: rows.length > PAGE && last ? encode({ ts: last.ts, id: last.m.id }) : null,
    };
  }

  async unreadTotal(user: PublicUser): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversationMembers, eq(conversationMembers.conversationId, messages.conversationId))
      .where(
        and(
          eq(conversationMembers.userId, user.id),
          ne(messages.senderId, user.id),
          sql`${messages.deletedAt} is null`,
          sql`${messages.createdAt} > ${conversationMembers.lastReadAt}`,
        ),
      );
    return row?.n ?? 0;
  }

  // --- Schreiben ----------------------------------------------------------------

  async send(user: PublicUser, id: string, body: string): Promise<ChatMessage> {
    const conv = await this.requireMember(id, user.id);
    if ((await this.cache.incr(`chat:rate:${user.id}`, 60)) > RATE_LIMIT_PER_MIN) {
      throw new HttpException({ message: "Zu viele Nachrichten. Bitte warte kurz.", statusCode: 429 }, 429);
    }
    const members = await this.db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, id));
    if (conv.kind === "direct") {
      const other = members.find((m) => m.userId !== user.id);
      if (!other) throw new ForbiddenException("Der Gesprächspartner ist nicht mehr erreichbar.");
      if ((await this.blockedBetween(user.id, [other.userId])).has(other.userId)) throw new ForbiddenException("Du kannst diesem Nutzer nicht schreiben.");
    }
    const key = this.crypto.unwrap(conv.wrappedKey, conv.keyVersion);
    const messageId = crypto.randomUUID();
    const [row] = await this.db
      .insert(messages)
      .values({ id: messageId, conversationId: id, senderId: user.id, ciphertext: this.crypto.encrypt(key, body, aad(id, messageId)) })
      .returning();
    await this.db.update(conversations).set({ lastMessageAt: row.createdAt }).where(eq(conversations.id, id));
    await this.db
      .update(conversationMembers)
      .set({ lastReadAt: row.createdAt })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
    await this.publish(members.map((m) => m.userId), { type: "message", conversationId: id, messageId });
    return this.toMessage(row, key, id, user.id, new Map([[user.id, user.displayName]]));
  }

  async markRead(user: PublicUser, id: string): Promise<void> {
    await this.requireMember(id, user.id);
    await this.db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
    await this.publish([user.id], { type: "read", conversationId: id });
  }

  /** Eigene Nachricht loeschen: Inhalt wird unwiederbringlich entfernt, ein Platzhalter bleibt. */
  async deleteMessage(user: PublicUser, messageId: string): Promise<void> {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!m) throw new NotFoundException("Nachricht nicht gefunden.");
    await this.requireMember(m.conversationId, user.id);
    if (m.senderId !== user.id) throw new ForbiddenException("Du kannst nur eigene Nachrichten loeschen.");
    await this.db.update(messages).set({ deletedAt: new Date(), ciphertext: "" }).where(eq(messages.id, messageId));
    const members = await this.db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, m.conversationId));
    await this.publish(members.map((x) => x.userId), { type: "message", conversationId: m.conversationId, messageId });
  }

  async setRetention(user: PublicUser, id: string, days: number | null): Promise<ConversationDetail> {
    const conv = await this.requireMember(id, user.id);
    if (conv.kind !== "group") throw new ForbiddenException("Die Loeschfrist von Direktchats ist festgelegt.");
    await this.requireOwner(id, user.id);
    await this.db.update(conversations).set({ retentionDays: days }).where(eq(conversations.id, id));
    return this.detail(user, id);
  }

  // --- Gruppen verwalten ---------------------------------------------------------

  async addMembers(user: PublicUser, id: string, userIds: string[]): Promise<ConversationDetail> {
    const conv = await this.requireMember(id, user.id);
    if (conv.kind !== "group" || !conv.orgId) throw new ForbiddenException("Nur in Gruppen moeglich.");
    await this.requireOwner(id, user.id);
    const valid = await this.orgs.activeMemberIds(conv.orgId, [...new Set(userIds)]);
    if (valid.length !== new Set(userIds).size) throw new BadRequestException("Alle muessen aktive Vereinsmitglieder sein.");
    await this.db.insert(conversationMembers).values(valid.map((u) => ({ conversationId: id, userId: u, role: "member" }))).onConflictDoNothing();
    await this.publish(valid, { type: "conversation", conversationId: id });
    return this.detail(user, id);
  }

  /** Mitglied entfernen (Besitzer) oder selbst austreten. Verlaesst der letzte Besitzer die Gruppe, erbt das aelteste Mitglied. */
  async removeMember(user: PublicUser, id: string, targetId: string): Promise<void> {
    const conv = await this.requireMember(id, user.id);
    if (conv.kind !== "group") throw new ForbiddenException("Direktchats kann man nicht verlassen - blockiere stattdessen den Kontakt.");
    if (targetId !== user.id) await this.requireOwner(id, user.id);
    await this.db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, targetId)));
    const rest = await this.db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, id)).orderBy(asc(conversationMembers.joinedAt));
    if (rest.length === 0) {
      await this.db.delete(conversations).where(eq(conversations.id, id)); // Kaskade: Nachrichten
    } else if (!rest.some((m) => m.role === "owner")) {
      await this.db.update(conversationMembers).set({ role: "owner" }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, rest[0].userId)));
    }
    await this.publish([targetId, ...rest.map((m) => m.userId)], { type: "conversation", conversationId: id });
  }

  // --- Blockieren und Melden -------------------------------------------------------

  async block(user: PublicUser, targetId: string): Promise<void> {
    if (targetId === user.id) throw new BadRequestException("Du kannst dich nicht selbst blockieren.");
    await this.db.insert(chatBlocks).values({ blockerId: user.id, blockedId: targetId }).onConflictDoNothing();
  }

  async unblock(user: PublicUser, targetId: string): Promise<void> {
    await this.db.delete(chatBlocks).where(and(eq(chatBlocks.blockerId, user.id), eq(chatBlocks.blockedId, targetId)));
  }

  async blocks(user: PublicUser): Promise<{ userId: string; name: string }[]> {
    const rows = await this.db.select().from(chatBlocks).where(eq(chatBlocks.blockerId, user.id));
    const names = await this.directory.names(rows.map((r) => r.blockedId));
    return rows.map((r) => ({ userId: r.blockedId, name: names.get(r.blockedId) ?? DELETED_USER }));
  }

  /** Meldung: nur Mitglieder der Unterhaltung. Nur die gemeldete Nachricht wird als verschluesselte Kopie gesichert. */
  async report(user: PublicUser, messageId: string, input: ReportInput): Promise<void> {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!m || m.deletedAt) throw new NotFoundException("Nachricht nicht gefunden.");
    await this.requireMember(m.conversationId, user.id);
    if (m.senderId === user.id) throw new BadRequestException("Eigene Nachrichten kannst du nicht melden.");
    await this.db.insert(messageReports).values({
      messageId,
      conversationId: m.conversationId,
      reporterId: user.id,
      reason: input.reason,
      note: input.note,
      snapshot: m.ciphertext,
    });
  }

  // --- Plattform-Moderation (nur Rolle platform admin, jeder Zugriff wird protokolliert) ---------

  /** Gemeldete Nachrichten im Klartext - ausschliesslich die gemeldete Nachricht, kein Verlauf. */
  async listReports(admin: PublicUser, status = "open"): Promise<ChatReportItem[]> {
    const rows = await this.db
      .select({ r: messageReports, m: messages, c: conversations })
      .from(messageReports)
      .innerJoin(messages, eq(messages.id, messageReports.messageId))
      .innerJoin(conversations, eq(conversations.id, messageReports.conversationId))
      .where(eq(messageReports.status, status))
      .orderBy(desc(messageReports.createdAt))
      .limit(100);
    const names = await this.directory.names(rows.flatMap(({ r, m }) => [r.reporterId, m.senderId]));
    await this.audit.record(admin.id, "platform.chat-reports.viewed", { reportIds: rows.map(({ r }) => r.id) });
    return rows.map(({ r, m, c }) => {
      const key = this.crypto.unwrap(c.wrappedKey, c.keyVersion);
      let text: string | null = null;
      if (!m.deletedAt && r.snapshot) {
        try {
          text = this.crypto.decrypt(key, r.snapshot, aad(c.id, m.id)); // Beweiskopie zum Meldezeitpunkt
        } catch {
          text = null;
        }
      }
      return {
        id: r.id,
        reason: r.reason,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        reporterName: names.get(r.reporterId) ?? DELETED_USER,
        senderName: names.get(m.senderId) ?? DELETED_USER,
        conversationKind: c.kind as "direct" | "group",
        text,
      };
    });
  }

  async resolveReport(admin: PublicUser, reportId: string, input: { action: "dismiss" | "delete"; note?: string }): Promise<void> {
    const [report] = await this.db.select().from(messageReports).where(eq(messageReports.id, reportId)).limit(1);
    if (!report) throw new NotFoundException("Meldung nicht gefunden.");
    const now = new Date();
    if (input.action === "delete") {
      await this.db.update(messages).set({ deletedAt: now, ciphertext: "" }).where(eq(messages.id, report.messageId));
      await this.db
        .update(messageReports)
        .set({ status: "actioned" })
        .where(and(eq(messageReports.messageId, report.messageId), eq(messageReports.status, "open")));
      const members = await this.db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, report.conversationId));
      await this.publish(members.map((m) => m.userId), { type: "message", conversationId: report.conversationId, messageId: report.messageId });
    } else {
      await this.db.update(messageReports).set({ status: "dismissed" }).where(eq(messageReports.id, reportId));
    }
    await this.audit.record(admin.id, "platform.chat-report.resolved", { reportId, action: input.action, note: input.note ?? null });
  }

  // --- Datenschutz: Auskunft und Loeschung --------------------------------------------

  /** Art. 15/20 DSGVO: alle eigenen Nachrichten im Klartext (nur die eigenen, nicht die der anderen). */
  async exportUser(userId: string) {
    const convs = await this.db
      .select({ c: conversations })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(eq(conversationMembers.userId, userId));
    const out: { conversation: string; kind: string; sentAt: string; text: string | null }[] = [];
    for (const { c } of convs) {
      const key = this.crypto.unwrap(c.wrappedKey, c.keyVersion);
      const mine = await this.db.select().from(messages).where(and(eq(messages.conversationId, c.id), eq(messages.senderId, userId))).orderBy(asc(messages.createdAt));
      for (const m of mine) {
        out.push({
          conversation: c.title ?? "Direktnachricht",
          kind: c.kind,
          sentAt: m.createdAt.toISOString(),
          text: m.deletedAt ? null : this.crypto.decrypt(key, m.ciphertext, aad(c.id, m.id)),
        });
      }
    }
    const blocked = await this.db.select().from(chatBlocks).where(eq(chatBlocks.blockerId, userId));
    return { conversations: convs.length, messagesSent: out, blockedUsers: blocked.length };
  }

  /** Art. 17 DSGVO: Nachrichten des Nutzers, Mitgliedschaften, Sperren und Meldungen entfernen; leere Unterhaltungen loeschen. */
  async eraseUser(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const memberOf = await tx.select({ id: conversationMembers.conversationId }).from(conversationMembers).where(eq(conversationMembers.userId, userId));
      await tx.delete(messages).where(eq(messages.senderId, userId)); // kaskadiert Meldungen zu diesen Nachrichten
      await tx.delete(messageReports).where(eq(messageReports.reporterId, userId));
      await tx.delete(conversationMembers).where(eq(conversationMembers.userId, userId));
      await tx.delete(chatBlocks).where(or(eq(chatBlocks.blockerId, userId), eq(chatBlocks.blockedId, userId)));
      for (const { id } of memberOf) {
        const rest = await tx.select().from(conversationMembers).where(eq(conversationMembers.conversationId, id)).orderBy(asc(conversationMembers.joinedAt));
        if (rest.length === 0) await tx.delete(conversations).where(eq(conversations.id, id));
        else if (!rest.some((m) => m.role === "owner")) {
          const [c] = await tx.select().from(conversations).where(eq(conversations.id, id)).limit(1);
          if (c?.kind === "group") await tx.update(conversationMembers).set({ role: "owner" }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, rest[0].userId)));
        }
      }
    });
  }

  // --- Hintergrundjobs ---------------------------------------------------------------

  /** Loeschfristen (Speicherbegrenzung): Standard fuer alle, pro Gruppe einstellbar. Offen gemeldete Nachrichten bleiben bis zur Pruefung. */
  async purgeExpired(): Promise<number> {
    const res: any = await this.db.execute(sql`
      delete from chat.messages m
      using chat.conversations c
      where m.conversation_id = c.id
        and m.created_at < now() - make_interval(days => coalesce(c.retention_days, ${defaultRetentionDays()}))
        and not exists (select 1 from chat.message_reports r where r.message_id = m.id and r.status = 'open')
      returning m.id`);
    // erledigte Meldungen nach 30 Tagen samt Beweiskopie entfernen
    await this.db.execute(sql`delete from chat.message_reports where status <> 'open' and created_at < now() - interval '30 days'`);
    return (Array.isArray(res) ? res : res.rows ?? []).length;
  }

  /** Master-Schluessel rotieren: Datenschluessel auf die aktive Version umhuellen (Nachrichten bleiben unveraendert). */
  async rewrapKeys(): Promise<number> {
    const stale = await this.db.select().from(conversations).where(ne(conversations.keyVersion, this.crypto.activeVersion)).limit(1000);
    for (const c of stale) {
      const { wrapped, version } = this.crypto.rewrap(c.wrappedKey, c.keyVersion);
      await this.db.update(conversations).set({ wrappedKey: wrapped, keyVersion: version }).where(eq(conversations.id, c.id));
    }
    return stale.length;
  }

  // --- intern -------------------------------------------------------------------------

  private publish(userIds: string[], event: ChatEvent) {
    return this.bus.publish({ userIds: [...new Set(userIds)], event });
  }

  private async requireMember(conversationId: string, userId: string): Promise<Conv> {
    const [row] = await this.db
      .select({ c: conversations })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
      .limit(1);
    // 404 statt 403: verraet nicht, ob es die Unterhaltung gibt
    if (!row) throw new NotFoundException("Unterhaltung nicht gefunden.");
    return row.c;
  }

  private async requireOwner(conversationId: string, userId: string) {
    const [m] = await this.db
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId), eq(conversationMembers.role, "owner")))
      .limit(1);
    if (!m) throw new ForbiddenException("Nur der Besitzer der Gruppe darf das.");
  }

  /** IDs aus `ids`, mit denen `userId` in irgendeiner Richtung eine Sperre hat. */
  private async blockedBetween(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select()
      .from(chatBlocks)
      .where(or(and(eq(chatBlocks.blockerId, userId), inArray(chatBlocks.blockedId, ids)), and(eq(chatBlocks.blockedId, userId), inArray(chatBlocks.blockerId, ids))) as SQL);
    return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
  }

  private async orgSlugs(orgIds: (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(orgIds.filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    for (const id of ids) {
      const slug = await this.orgs.slugOf(id);
      if (slug) map.set(id, slug);
    }
    return map;
  }

  private toMessage(m: typeof messages.$inferSelect, key: Buffer, conversationId: string, viewerId: string, names: Map<string, string>): ChatMessage {
    return {
      id: m.id,
      senderId: m.senderId,
      senderName: names.get(m.senderId) ?? DELETED_USER,
      body: m.deletedAt ? null : this.crypto.decrypt(key, m.ciphertext, aad(conversationId, m.id)),
      deleted: !!m.deletedAt,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === viewerId,
    };
  }
}
