export class DomainError<TCode extends string> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DomainError";
    this.code = code;
  }
}

export function assertNever(value: never, context: string): never {
  throw new DomainError(
    "UNREACHABLE_DOMAIN_STATE",
    `Unhandled ${context}: ${String(value)}`,
  );
}
