import type { ActionResult } from "@/types/actions";

export function ActionMessage({ result }: { result: ActionResult }) {
  if (!result.message) {
    return null;
  }

  return (
    <div
      className={
        result.ok
          ? "rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          : "rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
      }
      role={result.ok ? "status" : "alert"}
    >
      {result.message}
    </div>
  );
}
