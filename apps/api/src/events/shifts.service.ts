import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CreateShiftInput, PublicUser, ShiftItem, UpdateShiftInput } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { eventShiftSignups, eventShifts, orgMembers, teamMembers } from "../db/schema";
import { OrgsService } from "../orgs/orgs.service";
import { eventEnded, EventsService, isCheckViolation, type EventRow } from "./events.service";

const MAX_SHIFTS = 50;

/**
 * Helferlisten: Dienste an einem Termin mit begrenzten Plaetzen. Der Zaehler `taken` wird per Trigger gepflegt und
 * per CHECK begrenzt: Bei parallelen Eintragungen in den letzten Platz gewinnt genau eine (die anderen: 409).
 */
@Injectable()
export class ShiftsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(OrgsService) private readonly orgs: OrgsService,
  ) {}

  /** Wer den Termin sieht, sieht die Dienste; Namen nur aktive Vereinsmitglieder (wie bei den Zusagen). */
  async list(user: PublicUser, eventId: string): Promise<ShiftItem[]> {
    const { row } = await this.events.requireVisible(user, eventId);
    return this.build(user, row);
  }

  async create(user: PublicUser, eventId: string, input: CreateShiftInput): Promise<ShiftItem[]> {
    const { item, row } = await this.events.requireVisible(user, eventId);
    if (!item.canManage) throw new ForbiddenException("Nur Vorstand und Moderation verwalten Helferlisten.");
    if (item.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    if (eventEnded(item)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    const [{ n, pos }] = await this.db
      .select({ n: sql<number>`count(*)::int`, pos: sql<number>`coalesce(max(${eventShifts.position}), -1)::int` })
      .from(eventShifts)
      .where(eq(eventShifts.eventId, eventId));
    if (n >= MAX_SHIFTS) throw new BadRequestException(`Höchstens ${MAX_SHIFTS} Dienste je Termin.`);
    await this.db.insert(eventShifts).values({
      eventId,
      title: input.title,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      slots: input.slots,
      position: pos + 1,
    });
    return this.build(user, row);
  }

  async update(user: PublicUser, shiftId: string, input: UpdateShiftInput): Promise<ShiftItem[]> {
    const { shift, item, row } = await this.manage(user, shiftId);
    if (eventEnded(item)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    const startsAt = input.startsAt === undefined ? shift.startsAt : input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt === undefined ? shift.endsAt : input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException("Das Ende muss nach dem Beginn liegen.");
    if (input.slots !== undefined && input.slots < shift.taken) {
      throw new BadRequestException(`Es sind schon ${shift.taken} Personen eingetragen.`);
    }
    try {
      await this.db
        .update(eventShifts)
        .set({ ...(input.title !== undefined ? { title: input.title } : {}), startsAt, endsAt, ...(input.slots !== undefined ? { slots: input.slots } : {}) })
        .where(eq(eventShifts.id, shiftId));
    } catch (err) {
      // Gleichzeitige Eintragung: CHECK taken <= slots
      if (isCheckViolation(err)) throw new BadRequestException("Es sind mehr Personen eingetragen als Plätze.");
      throw err;
    }
    return this.build(user, row);
  }

  async remove(user: PublicUser, shiftId: string): Promise<void> {
    await this.manage(user, shiftId);
    await this.db.delete(eventShifts).where(eq(eventShifts.id, shiftId));
  }

  /** Selbst eintragen: aktives Mitglied (Team-Termin: Teammitglied), Termin nicht abgesagt/vorbei. */
  async signup(user: PublicUser, shiftId: string): Promise<ShiftItem[]> {
    const { item, row } = await this.load(user, shiftId);
    if (!(await this.orgs.activeRole(row.orgId, user.id))) throw new ForbiddenException("Nur Vereinsmitglieder können sich eintragen.");
    if (row.teamId && !(await this.inTeam(row.teamId, user.id))) throw new ForbiddenException("Nur Mitglieder des Teams können sich eintragen.");
    if (item.canceled) throw new BadRequestException("Der Termin wurde abgesagt.");
    if (eventEnded(item)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    try {
      await this.db.insert(eventShiftSignups).values({ shiftId, userId: user.id }).onConflictDoNothing();
    } catch (err) {
      if (isCheckViolation(err)) throw new ConflictException("Dienst ist voll.");
      throw err;
    }
    return this.build(user, row);
  }

  async leave(user: PublicUser, shiftId: string): Promise<ShiftItem[]> {
    const { item, row } = await this.load(user, shiftId);
    if (eventEnded(item)) throw new BadRequestException("Der Termin liegt in der Vergangenheit.");
    await this.db.delete(eventShiftSignups).where(and(eq(eventShiftSignups.shiftId, shiftId), eq(eventShiftSignups.userId, user.id)));
    return this.build(user, row);
  }

  /** Verwaltung traegt jemanden aus. */
  async removeSignup(user: PublicUser, shiftId: string, targetId: string): Promise<void> {
    await this.manage(user, shiftId);
    await this.db.delete(eventShiftSignups).where(and(eq(eventShiftSignups.shiftId, shiftId), eq(eventShiftSignups.userId, targetId)));
  }

  // --- intern ---

  private async load(user: PublicUser, shiftId: string) {
    const [shift] = await this.db.select().from(eventShifts).where(eq(eventShifts.id, shiftId)).limit(1);
    if (!shift) throw new NotFoundException("Dienst nicht gefunden.");
    const { item, row } = await this.events.requireVisible(user, shift.eventId); // 404, wenn der Termin nicht sichtbar ist
    return { shift, item, row };
  }

  private async manage(user: PublicUser, shiftId: string) {
    const loaded = await this.load(user, shiftId);
    if (!loaded.item.canManage) throw new ForbiddenException("Nur Vorstand und Moderation verwalten Helferlisten.");
    return loaded;
  }

  private async inTeam(teamId: string, userId: string): Promise<boolean> {
    const [r] = await this.db.select({ u: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).limit(1);
    return !!r;
  }

  private async build(user: PublicUser, row: EventRow): Promise<ShiftItem[]> {
    const shifts = await this.db.select().from(eventShifts).where(eq(eventShifts.eventId, row.id)).orderBy(asc(eventShifts.position), asc(eventShifts.createdAt));
    if (!shifts.length) return [];
    const ids = shifts.map((s) => s.id);
    const member = !!(await this.orgs.activeRole(row.orgId, user.id));
    const signups = await this.db
      .select({ shiftId: eventShiftSignups.shiftId, userId: eventShiftSignups.userId })
      .from(eventShiftSignups)
      .where(inArray(eventShiftSignups.shiftId, ids))
      .limit(5000);
    const mine = new Set(signups.filter((s) => s.userId === user.id).map((s) => s.shiftId));
    let byShift: Map<string, ShiftItem["people"]> | null = null;
    if (member) {
      // Nur Personen, die noch aktive Mitglieder (bei Team-Terminen: im Team) sind
      const active = await this.db
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, row.orgId), eq(orgMembers.status, "active"), inArray(orgMembers.userId, signups.length ? [...new Set(signups.map((s) => s.userId))] : [user.id])));
      let allowed = new Set(active.map((a) => a.userId));
      if (row.teamId) {
        const inTeam = await this.db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, row.teamId));
        const team = new Set(inTeam.map((t) => t.userId));
        allowed = new Set([...allowed].filter((u) => team.has(u)));
      }
      const people = new Map((await this.events.people([...allowed])).map((p) => [p.userId, p]));
      byShift = new Map(ids.map((id) => [id, signups.filter((s) => s.shiftId === id && people.has(s.userId)).map((s) => people.get(s.userId)!)]));
    }
    return shifts.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      slots: s.slots,
      taken: s.taken,
      mine: mine.has(s.id),
      ...(byShift ? { people: byShift.get(s.id) ?? [] } : {}),
    }));
  }
}
