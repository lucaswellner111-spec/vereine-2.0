"use client";

import { ImageUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ORG_CATEGORIES, type OrgDetail } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { mediaUrl, removeOrgImage, uploadOrgImage } from "@/lib/media";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Avatar, Button, Card, CardSkeletons, ErrorState, Field, FileButton, SelectField, TextareaField } from "./ui";
import { ask, toast } from "./ui-hosts";

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Vereinsprofil (nur Vorstand): Name, Kategorie, Ort, Ueber uns sowie Logo und Banner.
 * Die Adresse (/vereine/<slug>) bleibt fest, damit geteilte Links weiter funktionieren.
 */
export function OrgProfileForm({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const org = useApi<OrgDetail>(`/orgs/${slug}`);
  const [form, setForm] = useState<{ name: string; category: string; city: string; about: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const [imgBusy, runImg] = useBusy();

  // Formular einmal aus den geladenen Daten fuellen (spaeteres Neuladen ueberschreibt keine Eingaben)
  const o = org.data;
  if (o && form === null) setForm({ name: o.name, category: o.category, city: o.city, about: o.about });

  if (org.error && !o) return <ErrorState message={org.error} onRetry={org.reload} />;
  if (!o || !form) return <CardSkeletons count={1} />;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      try {
        const updated = await api<OrgDetail>(`/orgs/${slug}`, { method: "PUT", body: form });
        org.setData(updated);
        setForm({ name: updated.name, category: updated.category, city: updated.city, about: updated.about });
        toast.success("Vereinsprofil gespeichert.");
      } catch (err) {
        setError(describeError(err));
      }
    });
  };

  const setImage = (kind: "logo" | "banner", file: File | undefined, input: HTMLInputElement) =>
    void runImg(async () => {
      if (!file) return;
      setError(null);
      try {
        const ref = await uploadOrgImage(slug, kind, file);
        org.setData((d) => d && (kind === "logo" ? { ...d, logoId: ref.id } : { ...d, bannerId: ref.id }));
        toast.success(kind === "logo" ? "Logo aktualisiert." : "Banner aktualisiert.");
      } catch (err) {
        setError(describeError(err));
      } finally {
        input.value = "";
      }
    });

  const dropImage = (kind: "logo" | "banner") =>
    void runImg(async () => {
      if (!(await ask(kind === "logo" ? "Logo entfernen?" : "Banner entfernen?", { confirmLabel: "Entfernen", danger: true }))) return;
      setError(null);
      try {
        await removeOrgImage(slug, kind);
        org.setData((d) => d && (kind === "logo" ? { ...d, logoId: null } : { ...d, bannerId: null }));
      } catch (err) {
        setError(describeError(err));
      }
    });

  return (
    <Card className="mb-6">
      <h2 className="mb-1 font-semibold">Vereinsprofil</h2>
      <p className="mb-4 text-sm text-muted">So erscheint dein Verein auf seiner Seite. Die Adresse /vereine/{slug} bleibt gleich.</p>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="mb-6 space-y-4">
        <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
          {o.bannerId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(o.bannerId, "banner-sm")} alt="Banner des Vereins" width={750} height={250} className="aspect-[3/1] w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/1] w-full items-center justify-center text-sm text-muted">Noch kein Banner</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={o.name} size={64} mediaId={o.logoId} kind="org" />
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <FileButton id="org-logo" accept={ACCEPT} disabled={imgBusy} onChange={(e) => setImage("logo", e.target.files?.[0], e.target)}>
                <ImageUp size={16} aria-hidden /> Logo hochladen
              </FileButton>
              {o.logoId && <Button variant="ghost" disabled={imgBusy} onClick={() => dropImage("logo")}>Logo entfernen</Button>}
              <FileButton id="org-banner" accept={ACCEPT} disabled={imgBusy} onChange={(e) => setImage("banner", e.target.files?.[0], e.target)}>
                <ImageUp size={16} aria-hidden /> Banner hochladen
              </FileButton>
              {o.bannerId && <Button variant="ghost" disabled={imgBusy} onClick={() => dropImage("banner")}>Banner entfernen</Button>}
            </div>
          )}
        </div>
        <p className="text-xs text-muted">
          JPEG, PNG oder WebP bis 8 MB; Banner im Format 3:1. Standortdaten (EXIF) werden entfernt. Bitte keine erkennbaren Personen ohne deren Einwilligung.
        </p>
      </div>

      <form onSubmit={save} className="max-w-lg space-y-4">
        <Field id="org-name" label="Name" required minLength={3} maxLength={80} disabled={!canEdit} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <SelectField id="org-category" label="Kategorie" disabled={!canEdit} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {ORG_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectField>
        <Field id="org-city" label="Ort" required minLength={2} maxLength={60} disabled={!canEdit} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <TextareaField id="org-about" label="Über uns" rows={4} maxLength={600} disabled={!canEdit} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} hint={`${form.about.length}/600`} />
        {canEdit ? <Button type="submit" busy={busy}>Speichern</Button> : <p className="text-xs text-muted">Nur der Vorstand kann das Vereinsprofil ändern.</p>}
      </form>
    </Card>
  );
}
