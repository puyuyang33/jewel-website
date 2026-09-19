import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { securityLogger } from "@/lib/security/logger";

import type { ListQuery, PageResult } from "./types";

export class ApplicationDataError extends Error {
  readonly publicMessage: string;
  readonly code: string;

  constructor(
    code: string,
    publicMessage = "The requested information could not be loaded.",
  ) {
    super(publicMessage);
    this.name = "ApplicationDataError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function assertDatabaseResult(
  error: PostgrestError | null,
  event: string,
  context: Record<string, unknown> = {},
): asserts error is null {
  if (!error) {
    return;
  }
  securityLogger.error(event, {
    ...context,
    databaseCode: error.code,
  });
  throw new ApplicationDataError(
    "DATABASE_UNAVAILABLE",
    "Veyra could not load this information. Please try again.",
  );
}

export function normalizeListQuery(
  input: ListQuery,
  defaultPageSize = 12,
): {
  page: number;
  pageSize: number;
  query: string | undefined;
  status: string | undefined;
  sort: string | undefined;
} {
  const page =
    Number.isSafeInteger(input.page) && (input.page ?? 0) > 0
      ? (input.page as number)
      : 1;
  const pageSize =
    Number.isSafeInteger(input.pageSize) &&
    (input.pageSize ?? 0) > 0 &&
    (input.pageSize ?? 0) <= 50
      ? (input.pageSize as number)
      : defaultPageSize;
  const query = input.query?.trim().slice(0, 80) || undefined;
  const status = input.status?.trim().slice(0, 50) || undefined;
  const sort = input.sort?.trim().slice(0, 30) || undefined;
  return { page, pageSize, query, status, sort };
}

export function safeSearchPattern(query: string): string {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export function toPageResult<T>(
  items: T[],
  total: number | null,
  page: number,
  pageSize: number,
): PageResult<T> {
  const safeTotal = total ?? items.length;
  return {
    items,
    page,
    pageSize,
    total: safeTotal,
    pageCount: Math.max(1, Math.ceil(safeTotal / pageSize)),
  };
}

export function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function jsonString(
  value: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : fallback;
}

export function latestPaymentStatus(
  payments: { status: string; updated_at: string }[],
): string {
  return (
    [...payments].sort(
      (left, right) =>
        Date.parse(right.updated_at) - Date.parse(left.updated_at),
    )[0]?.status ?? "not_started"
  );
}
