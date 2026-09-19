import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-ink text-sm font-semibold tracking-wide", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-ink/15 text-ink placeholder:text-stone focus:border-garnet focus:ring-garnet/10 min-h-12 w-full rounded-xl border bg-white px-4 text-base outline-none focus:ring-3",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-ink/15 text-ink placeholder:text-stone focus:border-garnet focus:ring-garnet/10 min-h-32 w-full resize-y rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-3",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) {
    return null;
  }

  return (
    <p className="text-sm font-medium text-red-700" role="alert">
      {children}
    </p>
  );
}
