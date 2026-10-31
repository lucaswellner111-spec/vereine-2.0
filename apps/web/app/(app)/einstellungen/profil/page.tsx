"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { FollowRequest, MutedItem, ProfileView } from "@vereine/shared";
import { SettingsTabs } from "@/components/settings-tabs";
import { Alert, Avatar, Button, Card, Checkbox, Field, PageHeader } from "@/components/ui";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [p, r, m] = await Promise.all([api<ProfileView>("/profiles/me"), api<FollowRequest[]>("/profiles/requests"), api<MutedItem[]>("/feed/muted")]);
      setProfile(p);
      setForm({ displayName: p.displayName, handle: p.handle, bio: p.bio, location: p.location, visibility: p.visibility, showClubs: p.showClubs });
      setRequests(r);
      setMuted(m);
    } catch (e) {
      setError(describeError(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(() => api("/profiles/me", { method: "PUT", body: form }), "Profil gespeichert.");
    setBusy(false);
  }

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    await run(() => uploadImage("avatar", file), "Profilbild aktualisiert.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <PageHeader title="Profil" subtitle="So sehen dich andere." action={profile && <Link href={`/profil/${profile.handle}`} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">Profil ansehen</Link>} />
      <SettingsTabs active="/einstellungen/profil" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      {!profile ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={profile.displayName} size={80} mediaId={profile.avatarId} />
              <div className="space-y-2">
                <input ref={fileRef} id="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onAvatar(e.target.files?.[0])} />
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="avatar" className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast hover:bg-brand-hover">Bild hochladen</label>
                  {profile.avatarId && <Button variant="secondary" onClick={() => run(() => removeAvatar(), "Profilbild entfernt.")}>Entfernen</Button>}
                </div>
                <p className="text-xs text-muted">JPEG, PNG oder WebP, bis 8 MB. Standortdaten (EXIF) werden entfernt.</p>
              </div>
            </div>
          </Card>

          <Card className="mb-6">
            <form onSubmit={save} className="max-w-md space-y-4">
              <Field id="displayName" label="Name" required minLength={2} maxLength={50} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <Field id="handle" label="Benutzername" required minLength={3} maxLength={30} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} hint="3–30 Zeichen: Buchstaben, Ziffern, Unterstrich. Dein Profil: /profil/benutzername" />
              <div className="space-y-1.5">
                <label htmlFor="bio" className="text-sm font-medium">Über dich</label>
                <textarea id="bio" rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
                <p className="text-xs text-muted">{form.bio.length}/300</p>
              </div>
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
              <Button type="submit" disabled={busy}>Speichern</Button>
            </form>
          </Card>

          <h2 className="mb-2 font-semibold">Folgeanfragen {requests.length > 0 && `(${requests.length})`}</h2>
          <Card className="mb-6 divide-y divide-border p-0">
            {requests.length === 0 ? (
              <p className="p-4 text-sm text-muted">Keine offenen Anfragen.</p>
            ) : (
              requests.map((r) => (
                <div key={r.userId} className="flex flex-wrap items-center gap-3 p-3">
                  <Link href={`/profil/${r.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={r.displayName} mediaId={r.avatarId} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.displayName}</span><span className="block truncate text-xs text-muted">@{r.handle}</span></span>
                  </Link>
                  <Button size="sm" onClick={() => run(() => api(`/profiles/requests/${r.userId}/decision`, { method: "POST", body: { decision: "approve" } }))}>Annehmen</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(() => api(`/profiles/requests/${r.userId}/decision`, { method: "POST", body: { decision: "reject" } }))}>Ablehnen</Button>
                </div>
              ))
            )}
          </Card>

          <h2 className="mb-2 font-semibold">Ausgeblendet im Feed</h2>
          <Card className="divide-y divide-border p-0">
            {muted.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nichts ausgeblendet. Über „Weniger davon“ an einem Beitrag kannst du Beiträge, Personen oder Vereine ausblenden.</p>
            ) : (
              muted.map((m) => (
                <div key={`${m.kind}-${m.id}`} className="flex items-center justify-between gap-3 p-3">
                  <p className="min-w-0 truncate text-sm"><span className="mr-2 text-xs text-muted">{kindLabel[m.kind]}</span>{m.label}</p>
                  <Button size="sm" variant="ghost" onClick={() => run(() => api(`/feed/muted/${m.kind}/${m.id}`, { method: "DELETE" }))}>Wieder anzeigen</Button>
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
