export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export function FaqList({
  items,
  startAt = 1,
}: {
  items: readonly FaqItem[];
  startAt?: number;
}) {
  return (
    <div className="border-ink/15 border-t">
      {items.map((item, index) => (
        <details
          key={item.question}
          className="group border-ink/15 border-b py-1"
        >
          <summary className="focus-visible:outline-garnet flex min-h-20 cursor-pointer list-none items-center gap-5 rounded-sm py-5 focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
            <span className="text-garnet w-8 shrink-0 font-mono text-xs">
              {String(index + startAt).padStart(2, "0")}
            </span>
            <span className="font-display flex-1 text-xl leading-snug sm:text-2xl">
              {item.question}
            </span>
            <span
              aria-hidden="true"
              className="border-brass/45 grid size-8 shrink-0 place-items-center rounded-full border text-lg transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="text-stone max-w-3xl pb-7 pl-13 text-base leading-7 sm:text-lg sm:leading-8">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
