"use server";

import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "../../../lib/admin/guards";

export async function serverThrowAction(): Promise<void> {
  await requireAdmin();
  throw new Error("[sentry-test] server action throw");
}

export async function serverCaptureAction(): Promise<{ eventId: string }> {
  await requireAdmin();
  const eventId = Sentry.captureException(
    new Error("[sentry-test] manual server captureException"),
  );
  return { eventId };
}
