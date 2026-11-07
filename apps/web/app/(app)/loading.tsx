import { CardSkeletons, Skeleton } from "@/components/ui";

/** Uebergang beim Seitenwechsel innerhalb der App (Server-Komponente, nutzt nur die Skeletons aus ui.tsx). */
export default function AppLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <CardSkeletons count={2} />
    </div>
  );
}
