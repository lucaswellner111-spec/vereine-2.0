"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { FollowRequest, MutedItem, ProfileView } from "@vereine/shared";
import { SettingsBackLink } from "@/components/settings-back-link";
import { Upload } from "lucide-react";
import { Alert, Avatar, Button, Card, CardSkeletons, Checkbox, ErrorState, Field, FileButton, LinkButton, PageHeader, TextareaField, Toggle } from "@/components/ui";
import { setShortcutsEnabled, shortcutsEnabled } from "@/lib/shortcuts";
import { toast } from "@/components/ui-hosts";
import { useMyProfile } from "@/lib/my-profile";
import { api, describeError } from "@/lib/api";
import { removeAvatar, uploadImage } from "@/lib/media";
import { useAuth } from "@/lib/auth";

const kindLabel = { post: "Beitrag", user: "Person", org: "Verein" } as const;

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [form, setForm] = useState({ displayName: "", handle: "", bio: "", location: "", visibility: "public" as "public" | "private", showClubs: true });
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [muted, setMuted] = useState<MutedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reloadMine = useMyProfile().reload;
  // erst nach dem Mounten lesen (localStorage gibt es beim Server-Rendern nicht)
  const [shortcutsOn, setShortcutsOn] = useState(true);
  useEffect(() => setShortcutsOn(shortcutsEnabled()), []);

  /** Profil laden; das Formular nur beim ersten Laden und nach dem Speichern ueberschreiben (sonst gehen Eingaben verloren). */
  const loadProfile = useCallback(async ({ resetForm }: { resetForm: boolean }) => {
    const p = await api<ProfileView>("/profiles/me");
    setProfile(p);
    if (resetForm) setForm({ displayName: p.displayName, handle: p.handle, bio: p.bio, location: p.location, visibility: p.visibility, showClubs: p.showClubs });
  }, []);
  const loadLists = useCallback(async () => {
    const [r, m] = await Promise.all([api<FollowRequest[]>("/profiles/requests"), api<MutedItem[]>("/feed/muted")]);
    setRequests(r);
    setMuted(m);
  }, []);
  const loadAll = useCallback(() => {
    setLoadError(null);
    Promise.all([loadProfile({ resetForm: true }), loadLists()]).catch((e) => setLoadError(describeError(e)));
  }, [loadProfile, loadLists]);
  useEffect(loadAll, [loadAll]);

  const run = async (fn: () => Promise<unknown>, after: () => Promise<void>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) toast.success(ok);
      await after();
      reloadMine(); // Avatar/Handle in Kopfleiste und Seitenleiste aktualisieren
    } catch (e) {
      setError(describeError(e));
    }
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(() => api("/profiles/me", { method: "PUT", body: form }), () => loadProfile({ resetForm: true }), "Profil gespeichert.");
    setBusy(false);
  }

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    await run(() => uploadImage("avatar", file), () => loadProfile({ resetForm: false }), "Profilbild aktualisiert.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Profil" subtitle="So sehen dich andere." action={profile && <LinkButton href={`/profil/${profile.handle}`} variant="secondary">Profil ansehen</LinkButton>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!profile && loadError ? (
        <ErrorState message={loadError} onRetry={loadAll} />
      ) : !profile ? (
        <CardSkeletons count={2} />
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={profile.displayName} size={80} mediaId={profile.avatarId} />
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <FileButton ref={fileRef} id="avatar" variant="primary" accept="image/jpeg,image/png,image/webp" onChange={(e) => onAvatar(e.target.files?.[0])}>
                    <Upload size={16} aria-hidden /> Bild hochladen
                  </FileButton>
                  {profile.avatarId && <Button variant="secondary" onClick={() => run(() => removeAvatar(), () => loadProfile({ resetForm: false }), "Profilbild entfernt.")}>Entfernen</Button>}
                </div>
                <p className="text-xs text-muted">JPEG, PNG oder WebP, bis 8 MB. Standortdaten (EXIF) werden entfernt.</p>
              </div>
            </div>
          </Card>

          <Card className="mb-6">
            <form onSubmit={save} className="max-w-md space-y-4">
              <Field id="displayName" label="Name" required minLength={2} maxLength={50} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <Field id="handle" label="Benutzername" required minLength={3} maxLength={30} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} hint="3–30 Zeichen: Buchstaben, Ziffern, Unterstrich. Dein Profil: /profil/benutzername" />
              <TextareaField id="bio" label="Über dich" rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} hint={`${form.bio.length}/300`} />
              <Field id="location" label="Ort" maxLength={60} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Sichtbarkeit</legend>
                <Checkbox id="private" checked={form.visibility === "private"} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? "private" : "public" })}>
                  Privates Profil: Beiträge sehen nur Follower, die ich freigebe.
                </Checkbox>
                <Checkbox id="clubs" checked={form.showClubs} onChange={(e) => setForm({ ...form, showClubs: e.target.checked })}>
                  Meine Vereine auf dem Profil anzeigen.
                </Checkbox>
              </fieldset>
              <Button type="submit" busy={busy}>Speichern</Button>
            </form>
          </Card>

          <Card className="mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Tastenkürzel</p>
                <p className="text-xs text-muted">Einzelne Tasten wie „g f“, „n“, „/“ und „?“. Gilt nur für diesen Browser.</p>
              </div>
              <Toggle
                checked={shortcutsOn}
                label="Tastenkürzel"
                onChange={(on) => {
                  setShortcutsEnabled(on);
                  setShortcutsOn(on);
                }}
              />
            </div>
          </Card>

          <h2 className="mb-2 font-semibold">Folgeanfragen {requests.length > 0 && `(${requests.length})`}</h2>
          <Card flush className="mb-6 divide-y divide-border">
            {requests.length === 0 ? (
              <p className="p-4 text-sm text-muted">Keine offenen Anfragen.</p>
            ) : (
              requests.map((r) => (
                <div key={r.userId} className="flex flex-wrap items-center gap-3 p-3">
                  <Link href={`/profil/${r.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={r.displayName} mediaId={r.avatarId} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.displayName}</span><span className="block truncate text-xs text-muted">@{r.handle}</span></span>
                  </Link>
                  <Button size="sm" onClick={() => run(() => api(`/profiles/requests/${r.userId}/decision`, { method: "POST", body: { decision: "approve" } }), loadLists)}>Annehmen</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(() => api(`/profiles/requests/${r.userId}/decision`, { method: "POST", body: { decision: "reject" } }), loadLists)}>Ablehnen</Button>
                </div>
              ))
            )}
          </Card>

          <h2 className="mb-2 font-semibold">Ausgeblendet im Feed</h2>
          <Card flush className="divide-y divide-border">
            {muted.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nichts ausgeblendet. Über „Weniger davon“ an einem Beitrag kannst du Beiträge, Personen oder Vereine ausblenden.</p>
            ) : (
              muted.map((m) => (
                <div key={`${m.kind}-${m.id}`} className="flex items-center justify-between gap-3 p-3">
                  <p className="min-w-0 truncate text-sm"><span className="mr-2 text-xs text-muted">{kindLabel[m.kind]}</span>{m.label}</p>
                  <Button size="sm" variant="ghost" onClick={() => run(() => api(`/feed/muted/${m.kind}/${m.id}`, { method: "DELETE" }), loadLists)}>Wieder anzeigen</Button>
                </div>
              ))
            )}
          </Card>
          {user && <p className="mt-4 text-xs text-muted">Angemeldet als {user.email}</p>}
        </>
      )}
    </>
  );
}
