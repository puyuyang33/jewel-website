import { Download } from "lucide-react";
import Link from "next/link";

export function AttachmentLink({
  id,
  fileName,
  mimeType,
  byteSize,
}: {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}) {
  return (
    <Link
      href={`/api/attachments/${id}/open`}
      target="_blank"
      rel="noopener noreferrer"
      className="group border-ink/10 hover:border-garnet/35 hover:bg-parchment/35 flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-sm transition"
    >
      <span className="min-w-0">
        <span className="group-hover:text-garnet block truncate font-semibold">
          {fileName}
        </span>
        <span className="text-stone mt-1 block text-xs">
          {mimeType} ·{" "}
          {Math.max(1, Math.ceil(byteSize / 1024)).toLocaleString()} KB
        </span>
      </span>
      <Download aria-label="Open attachment" size={16} />
    </Link>
  );
}
