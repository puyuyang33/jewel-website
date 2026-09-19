interface ErrorResponseOptions {
  status: number;
  code: string;
  message: string;
}

export function errorResponse({ status, code, message }: ErrorResponseOptions) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function noStoreJson<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}
