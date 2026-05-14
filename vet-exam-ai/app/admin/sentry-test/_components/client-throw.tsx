"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";

export function ClientThrowButton() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("[sentry-test] client-side render throw");
  }

  return (
    <button
      onClick={() => setShouldThrow(true)}
      className="kvle-btn-primary"
      style={{ background: "var(--wrong)", borderColor: "var(--wrong)" }}
    >
      Client throw (React render)
    </button>
  );
}

export function ClientCaptureButton() {
  return (
    <button
      onClick={() => {
        const id = Sentry.captureException(
          new Error("[sentry-test] manual client captureException"),
        );
        alert(`Sent. event id: ${id}`);
      }}
      className="kvle-btn-primary"
      style={{
        background: "var(--surface-raised)",
        borderColor: "var(--rule)",
        color: "var(--text)",
      }}
    >
      Client captureException (silent)
    </button>
  );
}
