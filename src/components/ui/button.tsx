import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-porcelain shadow-[0_10px_30px_rgba(31,29,26,0.16)] hover:bg-garnet focus-visible:outline-garnet",
  secondary:
    "border border-brass/45 bg-porcelain text-ink hover:border-brass hover:bg-parchment focus-visible:outline-brass",
  ghost: "bg-transparent text-ink hover:bg-parchment focus-visible:outline-ink",
  danger:
    "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 px-4 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-7 text-base",
  icon: "size-11 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  asChild = false,
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em] transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}
