export type SearchParameters = Record<string, string | string[] | undefined>;

export function firstParameter(
  parameters: SearchParameters,
  key: string,
): string | undefined {
  const value = parameters[key];
  return Array.isArray(value) ? value[0] : value;
}

export function positivePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
