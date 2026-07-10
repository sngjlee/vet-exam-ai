import { describe, it, expect } from "vitest";
import { jsonError, ApiError } from "./errors";

describe("jsonError", () => {
  it("returns a flat { error: code } body with the given status", async () => {
    const res = jsonError(ApiError.NotFound, 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("merges extra fields additively into the envelope", async () => {
    const res = jsonError(ApiError.ValidationFailed, 400, { issues: [{ path: ["x"] }] });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "validation_failed",
      issues: [{ path: ["x"] }],
    });
  });

  it("accepts arbitrary domain code strings (upload family)", async () => {
    const res = jsonError("too_large", 400);
    await expect(res.json()).resolves.toEqual({ error: "too_large" });
  });

  it("never places a raw message into the body unless passed as extra", async () => {
    const res = jsonError(ApiError.Internal, 500);
    const body = await res.json();
    expect(body).toEqual({ error: "internal_error" });
    expect(Object.keys(body)).toEqual(["error"]);
  });
});
