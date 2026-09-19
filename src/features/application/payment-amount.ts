export const PROVIDER_AMOUNT_MIN_MINOR = 1;
export const PROVIDER_AMOUNT_MAX_MINOR = 99_999_999;
export const PROVIDER_AMOUNT_MAX_MAJOR = "999999.99";

export function isProviderSupportedMinorAmount(amountMinor: number): boolean {
  return (
    Number.isSafeInteger(amountMinor) &&
    amountMinor >= PROVIDER_AMOUNT_MIN_MINOR &&
    amountMinor <= PROVIDER_AMOUNT_MAX_MINOR
  );
}

export function sumProviderSupportedMinorAmounts(
  amounts: readonly number[],
): number | null {
  let totalMinor = 0;
  for (const amountMinor of amounts) {
    if (
      !isProviderSupportedMinorAmount(amountMinor) ||
      totalMinor > PROVIDER_AMOUNT_MAX_MINOR - amountMinor
    ) {
      return null;
    }
    totalMinor += amountMinor;
  }
  return isProviderSupportedMinorAmount(totalMinor) ? totalMinor : null;
}
