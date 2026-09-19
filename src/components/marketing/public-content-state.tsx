import { AlertCircle, Archive } from "lucide-react";

export function PublicContentError({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="border-garnet/25 bg-garnet/[0.045] flex max-w-3xl gap-4 border p-6"
    >
      <AlertCircle
        aria-hidden="true"
        className="text-garnet mt-0.5 shrink-0"
        size={22}
        strokeWidth={1.5}
      />
      <div>
        <h2 className="font-display text-2xl">
          The archive cannot be shown just now.
        </h2>
        <p className="text-stone mt-2 leading-7">{message}</p>
      </div>
    </div>
  );
}

export function EmptyPortfolio() {
  return (
    <div className="border-ink/15 flex max-w-3xl gap-4 border p-6">
      <Archive
        aria-hidden="true"
        className="text-garnet mt-0.5 shrink-0"
        size={22}
        strokeWidth={1.5}
      />
      <div>
        <h2 className="font-display text-2xl">
          The public archive is being prepared.
        </h2>
        <p className="text-stone mt-2 leading-7">
          No projects are currently published. Private commission records remain
          separate from this page.
        </p>
      </div>
    </div>
  );
}
