import type { ReactNode } from "react";

const urlPattern = /\bhttps?:\/\/[^\s<>{}[\]]+/gi;

function trimTrailingPunctuation(url: string) {
  return url.replace(/[),.!?;:]+$/u, "");
}

export function MessageText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(urlPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const matchedUrl = match[0];
    const safeUrl = trimTrailingPunctuation(matchedUrl);
    const trailing = matchedUrl.slice(safeUrl.length);

    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    nodes.push(
      <a
        key={`${match.index}-${safeUrl}`}
        className="font-semibold break-all underline decoration-current/35 underline-offset-3 hover:decoration-current"
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {safeUrl}
      </a>,
    );

    if (trailing) {
      nodes.push(trailing);
    }

    cursor = match.index + matchedUrl.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return <p className="whitespace-pre-wrap">{nodes}</p>;
}
