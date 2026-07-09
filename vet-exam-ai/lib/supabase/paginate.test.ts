import { describe, it, expect } from "vitest";
import { fetchAllPaged } from "./paginate";

describe("fetchAllPaged", () => {
  it("returns a single short page as-is", async () => {
    const res = await fetchAllPaged(async () => ({ data: [1, 2, 3], error: null }), 10);
    expect(res).toEqual({ data: [1, 2, 3], error: null });
  });

  it("accumulates across full pages until a short page ends it", async () => {
    const pages = [[1, 2], [3, 4], [5]]; // pageSize 2: full, full, short
    const calls: Array<[number, number]> = [];
    const res = await fetchAllPaged(async (from, to) => {
      calls.push([from, to]);
      return { data: pages[from / 2] ?? [], error: null };
    }, 2);
    expect(res.data).toEqual([1, 2, 3, 4, 5]);
    expect(res.error).toBeNull();
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("fetches one more page when the last full page lands exactly on a boundary", async () => {
    let call = 0;
    const res = await fetchAllPaged(async () => {
      call += 1;
      return { data: call === 1 ? [1, 2] : [], error: null };
    }, 2);
    expect(res.data).toEqual([1, 2]);
    expect(call).toBe(2);
  });

  it("stops and returns the error on failure", async () => {
    const err = { message: "boom" };
    const res = await fetchAllPaged<number>(async () => ({ data: null, error: err }), 10);
    expect(res.data).toEqual([]);
    expect(res.error).toBe(err);
  });
});
