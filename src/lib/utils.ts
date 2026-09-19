import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(minorUnits: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(minorUnits / 100);
}

export function formatDate(
  value: string | Date,
  timeZone = "UTC",
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone,
    ...options,
  }).format(typeof value === "string" ? new Date(value) : value);
}
