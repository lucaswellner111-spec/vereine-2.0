import { toast } from "@/components/ui-hosts";

/** Teilt einen Link: am Handy ueber das System-Menue, sonst in die Zwischenablage kopieren. */
export async function shareLink(title: string, url: string): Promise<void> {
  const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, url: full });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return; // Nutzer hat abgebrochen
  }
  try {
    await navigator.clipboard.writeText(full);
    toast.success("Link kopiert");
  } catch {
    toast.error("Kopieren nicht möglich");
  }
}
