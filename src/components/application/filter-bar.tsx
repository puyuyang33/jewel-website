import { Search } from "lucide-react";

import { Input } from "@/components/ui/field";

interface FilterOption {
  value: string;
  label: string;
}

export function FilterBar({
  query,
  filter,
  filterOptions,
  placeholder = "Search",
}: {
  query?: string;
  filter?: string;
  filterOptions: FilterOption[];
  placeholder?: string;
}) {
  return (
    <form className="border-ink/10 grid gap-3 rounded-2xl border bg-white/70 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="relative flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search
          className="text-stone pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          aria-hidden="true"
          size={18}
        />
        <Input
          className="pl-11"
          name="query"
          defaultValue={query}
          placeholder={placeholder}
        />
      </label>
      <label className="min-w-0">
        <span className="sr-only">Filter by status</span>
        <select
          className="border-ink/15 text-ink focus:border-garnet focus:ring-garnet/10 min-h-12 w-full rounded-xl border bg-white px-4 text-base font-semibold outline-none focus:ring-3 sm:text-sm lg:min-w-48"
          name="status"
          defaultValue={filter}
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 w-full rounded-xl px-5 text-sm font-semibold sm:col-span-2 lg:col-span-1 lg:w-auto">
        Apply
      </button>
    </form>
  );
}
