import { Search } from "lucide-react";

import { Input } from "@/components/ui/field";

export function AdminInboxFilters({
  query,
  status,
  unreadOnly,
}: {
  query?: string;
  status?: string;
  unreadOnly: boolean;
}) {
  return (
    <form className="border-ink/10 grid gap-3 rounded-2xl border bg-white/70 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
      <label className="relative sm:col-span-2 lg:col-span-1">
        <span className="sr-only">Search customer, subject, or request</span>
        <Search
          aria-hidden="true"
          size={18}
          className="text-stone pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
        />
        <Input
          className="pl-11"
          name="query"
          defaultValue={query}
          placeholder="Search customer, subject, or request"
        />
      </label>
      <label className="min-w-0">
        <span className="sr-only">Conversation status</span>
        <select
          name="status"
          defaultValue={status}
          className="border-ink/15 min-h-12 w-full rounded-xl border bg-white px-4 text-base font-semibold sm:text-sm lg:min-w-44"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="archived">Archived</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label className="border-ink/10 flex min-h-12 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold">
        <input
          type="checkbox"
          name="unread"
          value="true"
          defaultChecked={unreadOnly}
          className="accent-garnet size-4"
        />
        Unread only
      </label>
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 w-full rounded-full px-5 text-sm font-semibold lg:w-auto">
        Apply
      </button>
    </form>
  );
}
