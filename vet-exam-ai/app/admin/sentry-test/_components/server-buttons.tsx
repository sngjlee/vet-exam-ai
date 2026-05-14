"use client";

import { useState, useTransition } from "react";
import { serverCaptureAction, serverThrowAction } from "../_actions";

export function ServerThrowButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await serverThrowAction();
          } catch {
            // server throws bubble up as fetch errors here — actual capture
            // happens server-side via onRequestError. swallow on client.
          }
        });
      }}
      className="kvle-btn-primary"
      style={{ background: "var(--wrong)", borderColor: "var(--wrong)" }}
    >
      {pending ? "Throwing…" : "Server action throw"}
    </button>
  );
}

export function ServerCaptureButton() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          start(async () => {
            const { eventId } = await serverCaptureAction();
            setResult(`event id: ${eventId}`);
          });
        }}
        className="kvle-btn-primary"
        style={{
          background: "var(--surface-raised)",
          borderColor: "var(--rule)",
          color: "var(--text)",
        }}
      >
        {pending ? "Sending…" : "Server captureException (silent)"}
      </button>
      {result && (
        <span className="text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
          {result}
        </span>
      )}
    </div>
  );
}
