import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerLoading() {
  return (
    <div aria-label="Loading private atelier" className="space-y-6">
      <Skeleton className="h-56 rounded-[2rem]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
