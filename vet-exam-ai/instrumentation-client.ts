import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Sample 10% of transactions in production, 100% in dev.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Replay 10% of sessions; 100% of sessions with an error.
    integrations: [Sentry.replayIntegration()],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // We do not attach IP / request headers automatically — opt-in if we need it later.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
