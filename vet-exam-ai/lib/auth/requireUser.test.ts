import { describe, it, expect, vi } from "vitest";

const { getUser, fakeSupabase } = vi.hoisted(() => {
  const getUserFn = vi.fn();
  return { getUser: getUserFn, fakeSupabase: { auth: { getUser: getUserFn } } };
});

vi.mock("../supabase/server", () => ({
  createClient: () => Promise.resolve(fakeSupabase),
}));

import { requireUser } from "./requireUser";

describe("requireUser", () => {
  it("returns a ready 401 response when there is no user", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await requireUser();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      await expect(res.response.json()).resolves.toEqual({
        error: "auth_required",
      });
    }
  });

  it("returns the supabase client and user when authed", async () => {
    const user = { id: "user-1" };
    getUser.mockResolvedValueOnce({ data: { user } });
    const res = await requireUser();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user).toBe(user);
      expect(res.supabase).toBe(fakeSupabase);
    }
  });
});
