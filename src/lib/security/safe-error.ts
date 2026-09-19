export interface SafeErrorDetails<TCode extends string = string> {
  code: TCode;
  message: string;
  status: number;
}

export abstract class SafeApplicationError<
  TCode extends string = string,
> extends Error {
  readonly code: TCode;
  readonly publicMessage: string;
  readonly status: number;

  protected constructor(details: SafeErrorDetails<TCode>) {
    super(details.message);
    this.name = "SafeApplicationError";
    this.code = details.code;
    this.publicMessage = details.message;
    this.status = details.status;
  }
}

const unexpectedError = Object.freeze<SafeErrorDetails>({
  code: "UNEXPECTED_ERROR",
  message: "Something went wrong. Please try again.",
  status: 500,
});

export function getSafeErrorDetails(error: unknown): SafeErrorDetails {
  if (error instanceof SafeApplicationError) {
    return {
      code: error.code,
      message: error.publicMessage,
      status: error.status,
    };
  }

  return { ...unexpectedError };
}

export function getSafeErrorPayload(error: unknown) {
  const details = getSafeErrorDetails(error);
  return {
    error: {
      code: details.code,
      message: details.message,
    },
  };
}
