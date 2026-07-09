import { describe, it, expect } from "vitest";
import { applyQuestionFiltersGeneric, getLatestYear } from "./filter";
import type { Difficulty } from "./types";

type Q = {
  id: string;
  category: string;
  topic?: string;
  difficulty?: Difficulty;
  year?: number;
  isActive?: boolean;
};

function q(id: string, over: Partial<Q> = {}): Q {
  return { id, category: "내과학", isActive: true, ...over };
}

const ids = (rows: Q[]) => rows.map((r) => r.id);

describe("applyQuestionFiltersGeneric", () => {
  it("excludes soft-deleted (isActive === false) questions", () => {
    const pool = [q("a"), q("b", { isActive: false })];
    expect(ids(applyQuestionFiltersGeneric(pool, {}))).toEqual(["a"]);
  });

  it("filters by category", () => {
    const pool = [q("a", { category: "내과학" }), q("b", { category: "외과학" })];
    const out = applyQuestionFiltersGeneric(pool, { categories: ["외과학"] });
    expect(ids(out)).toEqual(["b"]);
  });

  it("filters by topic and drops rows without a topic", () => {
    const pool = [
      q("a", { topic: "심장" }),
      q("b", { topic: "신장" }),
      q("c"),
    ];
    const out = applyQuestionFiltersGeneric(pool, { topics: ["심장"] });
    expect(ids(out)).toEqual(["a"]);
  });

  it("skipEasy removes easy questions only", () => {
    const pool = [
      q("a", { difficulty: "easy" }),
      q("b", { difficulty: "medium" }),
      q("c", { difficulty: "hard" }),
    ];
    const out = applyQuestionFiltersGeneric(pool, { skipEasy: true });
    expect(ids(out)).toEqual(["b", "c"]);
  });

  it("onlyWrong keeps just the wrong ids, and yields nothing without a set", () => {
    const pool = [q("a"), q("b"), q("c")];
    const wrong = new Set(["b"]);
    expect(
      ids(applyQuestionFiltersGeneric(pool, { onlyWrong: true, wrongQuestionIds: wrong })),
    ).toEqual(["b"]);
    expect(applyQuestionFiltersGeneric(pool, { onlyWrong: true })).toEqual([]);
  });

  it("recentYears keeps years within the window relative to the latest year", () => {
    const pool = [
      q("old", { year: 2018 }),
      q("mid", { year: 2022 }),
      q("new", { year: 2024 }),
      q("noyear"),
    ];
    // latest = 2024, window 5 -> cutoff 2020; 2018 and the null-year row drop.
    const out = applyQuestionFiltersGeneric(pool, { recentYears: 5 });
    expect(ids(out)).toEqual(["mid", "new"]);
  });
});

describe("getLatestYear", () => {
  it("returns the max year, ignoring null/undefined", () => {
    expect(getLatestYear([{ year: 2019 }, { year: 2023 }, { year: undefined }])).toBe(2023);
  });

  it("returns null when no row has a year", () => {
    expect(getLatestYear([{ year: undefined }, {}])).toBeNull();
  });
});
