import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="page-shell section-space"
      aria-busy="true"
      aria-label="Loading page"
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-6 h-20 max-w-3xl" />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}
