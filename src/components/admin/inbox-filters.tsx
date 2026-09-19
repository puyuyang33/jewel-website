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
    <form className="border-ink/10 grid gap-3 rounded-2xl border bg-white/70 p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
      <label className="relative">
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
      <label>
        <span className="sr-only">Conversation status</span>
        <select
          name="status"
          defaultValue={status}
          className="border-ink/15 min-h-12 min-w-44 rounded-xl border bg-white px-4 text-sm font-semibold"
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
      <button className="bg-ink text-porcelain hover:bg-garnet min-h-12 rounded-full px-5 text-sm font-semibold">
        Apply
      </button>
    </form>
  );
}
