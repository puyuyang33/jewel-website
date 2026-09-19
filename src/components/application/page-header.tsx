import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="border-ink/10 flex flex-col gap-6 border-b pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="font-display mt-2 text-[clamp(2.25rem,7vw,3rem)] leading-tight tracking-[-0.035em]">
          {title}
        </h1>
        {description ? (
          <p className="text-stone mt-3 max-w-2xl text-base leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full md:w-auto [&>*]:w-full md:[&>*]:w-auto">
          {action}
        </div>
      ) : null}
    </header>
  );
}
