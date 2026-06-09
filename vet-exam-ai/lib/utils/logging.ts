import * as Sentry from "@sentry/nextjs";

type LoggableError = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

type OperationalArea = "auth" | "supabase" | "rls" | "storage" | "cron" | "admin" | "api";

type OperationalErrorOptions = {
  area: OperationalArea;
  operation: string;
  failureKind: string;
  level?: Sentry.SeverityLevel;
  tags?: Record<string, string | number | boolean | null | undefined>;
  context?: Record<string, string | number | boolean | null | undefined>;
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

export function captureOperationalError(error: unknown, options: OperationalErrorOptions): void {
  const summary = safeErrorSummary(error);
  const captured = error instanceof Error ? error : new Error(summary.message);

  Sentry.withScope((scope) => {
    scope.setLevel(options.level ?? "error");
    scope.setTag("area", options.area);
    scope.setTag("operation", options.operation);
    scope.setTag("failure_kind", options.failureKind);

    if (summary.code) scope.setTag("error_code", summary.code);
    if (summary.status) scope.setTag("error_status", summary.status);

    for (const [key, value] of Object.entries(options.tags ?? {})) {
      if (value !== undefined && value !== null) scope.setTag(key, String(value));
    }

    scope.setContext("safe_error", summary);
    if (options.context) scope.setContext("operation", options.context);
    Sentry.captureException(captured);
  });
}

export function classifySupabaseFailure(error: unknown): "rls_denied" | "constraint" | "not_found" | "supabase_error" {
  const summary = safeErrorSummary(error);
  const message = summary.message.toLowerCase();
  const code = summary.code;

  if (code === "42501" || message.includes("row-level security") || message.includes("permission denied")) {
    return "rls_denied";
  }
  if (code === "23514" || code === "23503" || code === "23505") {
    return "constraint";
  }
  if (code === "PGRST116") {
    return "not_found";
  }
  return "supabase_error";
}
