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
    <form className="border-ink/10 flex flex-col gap-3 rounded-2xl border bg-white/70 p-3 sm:flex-row">
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
      <label>
        <span className="sr-only">Filter by status</span>
        <select
          className="border-ink/15 text-ink focus:border-garnet focus:ring-garnet/10 min-h-12 min-w-48 rounded-xl border bg-white px-4 text-sm font-semibold outline-none focus:ring-3"
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
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 rounded-xl px-5 text-sm font-semibold">
        Apply
      </button>
    </form>
  );
}
