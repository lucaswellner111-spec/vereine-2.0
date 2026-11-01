import { Injectable } from "@nestjs/common";

type LeaveHandler = (orgId: string, userId: string) => Promise<void>;

/**
 * Kleiner Ereignis-Verteiler: Bereiche, die auf Austritte reagieren muessen (z. B. Mitgliederverwaltung loescht
 * personenbezogene Stammdaten), melden sich hier an. So kennt `orgs` die anderen Bereiche nicht.
 */
@Injectable()
export class OrgEvents {
  private readonly leaveHandlers: LeaveHandler[] = [];

  onLeave(handler: LeaveHandler) {
    this.leaveHandlers.push(handler);
  }

  async emitLeave(orgId: string, userId: string): Promise<void> {
    for (const h of this.leaveHandlers) await h(orgId, userId);
  }
}
