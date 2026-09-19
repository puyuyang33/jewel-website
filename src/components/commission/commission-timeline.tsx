import { Check } from "lucide-react";

import { cn, formatDate } from "@/lib/utils";

export interface TimelineEventDto {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
  status: "completed" | "current" | "upcoming";
}

export function CommissionTimeline({
  events,
  timeZone = "UTC",
}: {
  events: TimelineEventDto[];
  timeZone?: string;
}) {
  return (
    <ol aria-label="Commission timeline">
      {events.map((event, index) => (
        <li
          key={event.id}
          className="relative grid grid-cols-[2.5rem_1fr] gap-4"
        >
          {index < events.length - 1 ? (
            <span
              aria-hidden="true"
              className="bg-ink/15 absolute top-10 left-[1.22rem] h-[calc(100%-1rem)] w-px"
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 grid size-10 place-items-center rounded-full border text-sm",
              event.status === "completed" && "border-sage bg-sage text-white",
              event.status === "current" &&
                "border-garnet bg-garnet ring-garnet/10 text-white ring-4",
              event.status === "upcoming" &&
                "border-ink/15 bg-porcelain text-stone",
            )}
          >
            {event.status === "completed" ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              index + 1
            )}
          </span>
          <div className="pb-9">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-ink font-semibold">{event.title}</h3>
              <time className="text-stone text-xs" dateTime={event.occurredAt}>
                {formatDate(event.occurredAt, timeZone)}
              </time>
            </div>
            <p className="text-stone mt-1 text-sm leading-6">
              {event.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
