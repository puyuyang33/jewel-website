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
    <form className="border-ink/10 grid gap-3 rounded-2xl border bg-white/70 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
      <label className="relative sm:col-span-2 lg:col-span-1">
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
        <label className="min-w-0">
          <span className="sr-only">Filter</span>
          <select
            className="border-ink/15 min-h-12 w-full rounded-xl border bg-white px-4 text-base font-semibold sm:text-sm lg:min-w-48"
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
        <label className="min-w-0">
          <span className="sr-only">Sort</span>
          <select
            className="border-ink/15 min-h-12 w-full rounded-xl border bg-white px-4 text-base font-semibold sm:text-sm lg:min-w-44"
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
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 w-full rounded-full px-5 text-sm font-semibold lg:w-auto">
        Apply
      </button>
    </form>
  );
}
