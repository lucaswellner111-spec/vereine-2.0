import clsx from "clsx";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RotateCw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ComponentPropsWithRef, InputHTMLAttributes, ReactNode } from "react";

/*
 * Basis-Komponenten. Bewusst OHNE Hooks und ohne "use client", damit sie auch in Server-Komponenten
 * (z. B. not-found) nutzbar sind. Interaktives liegt in ui-client.tsx.
 * className an diesen Komponenten nur fuer Layout (Breite, flex, margin, responsive hide) –
 * nie Hoehe/Hintergrund/Rahmen/Padding (es gibt kein tailwind-merge).
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function buttonClasses({ variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {}) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    // sm bei Touch etwas hoeher (40 px), Desktop-Optik unveraendert
    size === "md" ? "h-10 px-4 text-sm" : "h-9 px-3 text-xs pointer-coarse:h-10",
    variant === "primary" && "bg-brand text-brand-contrast hover:bg-brand-hover",
    variant === "secondary" && "border border-border bg-surface text-text hover:bg-surface-2",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
    variant === "danger" && "bg-danger text-on-danger hover:opacity-90",
  );
}

type ButtonProps = ComponentPropsWithRef<"button"> & { variant?: Variant; size?: Size; busy?: boolean };

export function Button({ variant = "primary", size = "md", busy = false, className, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={clsx(buttonClasses({ variant, size }), className)}
    >
      {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type LinkButtonProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Echtes <a> statt next/link – fuer /api-Downloads (CSV/PDF), data:-URLs und download-Links. */
  native?: boolean;
};

export function LinkButton({ variant = "primary", size = "md", className, native = false, href, children, ...props }: LinkButtonProps) {
  const cls = clsx(buttonClasses({ variant, size }), className);
  if (native) {
    // Link-spezifische Props (prefetch, replace, …) werden bei native nicht genutzt.
    return (
      <a {...(props as ComponentProps<"a">)} href={typeof href === "string" ? href : String(href)} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link {...props} href={href} className={cls}>
      {children}
    </Link>
  );
}

export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx("mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text", className)}>
      <ArrowLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}

export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline", className)}>
      {children}
      <ArrowRight size={14} aria-hidden />
    </Link>
  );
}

// ---------- Formular-Steuerelemente (ohne Standardbreite) ----------

const controlBase =
  "rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

type ControlExtra = { size?: Size; invalid?: boolean };

export function Input({ size = "md", invalid, className, ...props }: Omit<ComponentPropsWithRef<"input">, "size"> & ControlExtra) {
  return (
    <input
      aria-invalid={invalid ? "true" : undefined}
      {...props}
      className={clsx(controlBase, size === "md" ? "h-10" : "h-9 pointer-coarse:h-10", className)}
    />
  );
}

export function Select({ size = "md", invalid, className, ...props }: Omit<ComponentPropsWithRef<"select">, "size"> & ControlExtra) {
  return (
    <select
      aria-invalid={invalid ? "true" : undefined}
      {...props}
      className={clsx(controlBase, size === "md" ? "h-10" : "h-9 pointer-coarse:h-10", className)}
    />
  );
}

export function Textarea({ invalid, className, ...props }: ComponentPropsWithRef<"textarea"> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid ? "true" : undefined} {...props} className={clsx(controlBase, "resize-none p-3", className)} />;
}

/** ARIA-Verknuepfungen eines Steuerelements mit Hinweis- und Fehlertext. */
export function fieldAria(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode } = {}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    id,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(error ? { "aria-invalid": "true" as const } : {}),
  };
}

type ShellProps = { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string };

export function FieldShell({ id, label, hint, error, className, children }: ShellProps & { children: ReactNode }) {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldProps = Omit<ComponentPropsWithRef<"input">, "size" | "id"> & ShellProps & { size?: Size };

export function Field({ id, label, hint, error, className, size, ...props }: FieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <Input {...props} size={size} {...fieldAria(id, { hint, error })} className="w-full" />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<ComponentPropsWithRef<"select">, "size" | "id"> & ShellProps & { size?: Size };

export function SelectField({ id, label, hint, error, className, size, ...props }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <Select {...props} size={size} {...fieldAria(id, { hint, error })} className="w-full" />
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<ComponentPropsWithRef<"textarea">, "id"> & ShellProps;

export function TextareaField({ id, label, hint, error, className, ...props }: TextareaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <Textarea {...props} {...fieldAria(id, { hint, error })} className="w-full" />
    </FieldShell>
  );
}

type FileButtonProps = Omit<ComponentPropsWithRef<"input">, "type" | "size" | "className" | "children"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

/**
 * Datei-Auswahl im Button-Stil: echtes (unsichtbares) input[type=file] im label, daher per Tab
 * erreichbar und per Enter/Leertaste bedienbar; der Fokusring liegt am label (focus-within).
 */
export function FileButton({ variant = "secondary", size = "md", className, children, disabled, ...props }: FileButtonProps) {
  return (
    <label
      className={clsx(
        buttonClasses({ variant, size }),
        "cursor-pointer focus-within:ring-2 focus-within:ring-[var(--ring)]",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input type="file" {...props} disabled={disabled} className="sr-only" />
      {children}
    </label>
  );
}

export function Checkbox({
  id,
  children,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm pointer-coarse:min-h-11 pointer-coarse:items-center">
      <input id={id} type="checkbox" {...props} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)] pointer-coarse:mt-0 pointer-coarse:h-5 pointer-coarse:w-5" />
      <span>{children}</span>
    </label>
  );
}

/** flush = ohne Innenabstand (Listen mit eigenen Zeilenabstaenden); p-0 per className wirkt nicht, da p-4 spaeter sortiert. */
export function Card({ className, flush = false, children }: { className?: string; flush?: boolean; children: ReactNode }) {
  return <div className={clsx("rounded-xl border border-border bg-surface shadow-card", !flush && "p-4", className)}>{children}</div>;
}

/**
 * Tabelle, die unter sm (640 px) zu Karten wird: jede Zeile ein Block, Spalten untereinander mit
 * sichtbarer Beschriftung (CellLabel). Der Tabellenkopf bleibt fuer Screenreader (sr-only); unter sm
 * geht die Tabellen-Semantik per CSS bewusst verloren, die Beschriftungen tragen die Bedeutung.
 */
export const stackTable = {
  table: "w-full text-left text-sm max-sm:block",
  thead: "border-b border-border text-xs text-muted max-sm:sr-only",
  tbody: "max-sm:block max-sm:divide-y max-sm:divide-border",
  // flex-col statt block: so kann die Titelzelle (tdMain) per order nach oben, auch wenn sie nicht die erste Spalte ist
  tr: "border-b border-border last:border-0 max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:border-0 max-sm:p-3",
  td: "p-3 max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:p-0",
  tdMain: "p-3 max-sm:order-first max-sm:block max-sm:p-0 max-sm:font-medium",
  tdActions: "p-3 max-sm:block max-sm:p-0 max-sm:pt-2",
};

/** Beschriftung einer Zelle, nur in der Kartenansicht (unter sm) sichtbar. */
export function CellLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted sm:hidden">{children}</span>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "accent" | "danger"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "brand" && "bg-brand/15 text-brand",
        tone === "accent" && "bg-accent/20 text-accent",
        tone === "danger" && "bg-danger/15 text-danger",
      )}
    >
      {children}
    </span>
  );
}

/** kind "org": Vereinslogo (Varianten logo/logo-sm, abgerundetes Quadrat statt Kreis). */
export function Avatar({ name, size = 36, mediaId, kind = "user" }: { name: string; size?: number; mediaId?: string | null; kind?: "user" | "org" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (mediaId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/${mediaId}/${kind === "org" ? (size <= 48 ? "logo-sm" : "logo") : size <= 48 ? "avatar-sm" : "avatar"}`}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        className={clsx("shrink-0 bg-surface-2 object-cover", kind === "org" ? "rounded-xl" : "rounded-full")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand"
    >
      {initials}
    </span>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "info" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={clsx(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
        tone === "info" && "border-border bg-surface-2 text-muted",
        tone === "success" && "border-brand/40 bg-brand/10 text-brand",
      )}
    >
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "hit-area relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand" : "bg-border",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/**
 * Kopf einer Detailseite (Profil, Verein, Termin): Bild/Avatar, h1, Badges, Untertitel, Aktionen.
 * Der Zurueck-Link steht immer darueber (nicht Teil des Kopfs).
 */
export function DetailHeader({
  media,
  title,
  titleClassName,
  badges,
  subtitle,
  actions,
  children,
}: {
  media?: ReactNode;
  title: string;
  /** nur fuer Zustandsoptik wie line-through bei abgesagt */
  titleClassName?: string;
  badges?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start gap-4 sm:gap-6">
        {media}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={clsx("min-w-0 max-w-full break-words text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]", titleClassName)}>{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-1 break-words text-sm text-muted">{subtitle}</div>}
          {children}
        </div>
        {/* Handy: Aktionen in eigener Zeile, damit sie den Namen nicht verdecken */}
        {actions && <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">{actions}</div>}
      </div>
    </div>
  );
}

/** Abschnittsueberschrift innerhalb einer Seite (h2). */
export function SectionTitle({ children, className, icon: Icon }: { children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <h2 className={clsx("flex items-center gap-2 text-base font-semibold", className)}>
      {Icon && <Icon size={16} aria-hidden className="text-muted" />}
      {children}
    </h2>
  );
}

/** Leerer Zustand einer Liste/Seite: Icon, Titel, Erklaerung, optional eine Aktion. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl border border-dashed border-border px-4 py-8 text-center", className)}>
      {Icon && <Icon size={28} aria-hidden className="mx-auto mb-3 text-muted" />}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Ladefehler mit optionalem "Erneut versuchen". */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "Erneut versuchen",
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={clsx("rounded-xl border border-danger/40 bg-surface px-4 py-6 text-center", className)}>
      <AlertTriangle size={24} aria-hidden className="mx-auto mb-2 text-danger" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
          <RotateCw size={14} aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Platzhalter beim Laden: behaelt das Layout stabil und kuendigt sich Screenreadern als "Lade" an. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** Zeilen-Platzhalter fuer einfache Listen und Tabellen. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Lade" className={clsx("space-y-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
      <span className="sr-only">Lade …</span>
    </div>
  );
}

/** Liste von Karten-Platzhaltern (Feed, Vereine, Termine). */
export function CardSkeletons({ count = 3, media = false }: { count?: number; media?: boolean }) {
  return (
    <div role="status" aria-label="Lade" className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          {media && <Skeleton className="mt-4 h-48 w-full rounded-xl" />}
        </div>
      ))}
      <span className="sr-only">Lade …</span>
    </div>
  );
}
