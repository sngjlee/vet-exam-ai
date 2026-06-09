type LoggableError = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

export function safeErrorSummary(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") {
    return { message: "unknown_error" };
  }

  const e = error as LoggableError;
  const code = text(e.code);
  const status = text(e.status);

  return {
    message: text(e.message) ?? text(e.name) ?? "unknown_error",
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
  };
}

export function logError(label: string, error: unknown): void {
  console.error(label, safeErrorSummary(error));
}

export function logWarn(label: string, error: unknown): void {
  console.warn(label, safeErrorSummary(error));
}
