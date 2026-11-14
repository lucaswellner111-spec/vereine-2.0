import { redirect } from "next/navigation";

/** Alte Adresse: Benachrichtigungen leben jetzt auf der Aktivitaetsseite. */
export default function LegacyNotificationsPage() {
  redirect("/aktivitaet");
}
