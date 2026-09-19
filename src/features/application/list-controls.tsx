import { Search } from "lucide-react";

import { Input } from "@/components/ui/field";

export function ListControls({
  query,
  status,
  sort,
  searchLabel,
  statusOptions,
  sortOptions = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
  ],
}: {
  query?: string;
  status?: string;
  sort?: string;
  searchLabel: string;
  statusOptions?: { value: string; label: string }[];
  sortOptions?: { value: string; label: string }[];
}) {
  return (
    <form className="border-ink/10 grid gap-3 rounded-2xl border bg-white/70 p-3 md:grid-cols-[1fr_auto_auto_auto]">
      <label className="relative">
        <span className="sr-only">{searchLabel}</span>
        <Search
          className="text-stone pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          aria-hidden="true"
          size={18}
        />
        <Input
          className="pl-11"
          name="query"
          defaultValue={query}
          placeholder={searchLabel}
        />
      </label>
      {statusOptions ? (
        <label>
          <span className="sr-only">Filter</span>
          <select
            className="border-ink/15 min-h-12 min-w-48 rounded-xl border bg-white px-4 text-sm font-semibold"
            name="status"
            defaultValue={status}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {sortOptions.length > 0 ? (
        <label>
          <span className="sr-only">Sort</span>
          <select
            className="border-ink/15 min-h-12 min-w-44 rounded-xl border bg-white px-4 text-sm font-semibold"
            name="sort"
            defaultValue={sort ?? "newest"}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 rounded-full px-5 text-sm font-semibold">
        Apply
      </button>
    </form>
  );
}
