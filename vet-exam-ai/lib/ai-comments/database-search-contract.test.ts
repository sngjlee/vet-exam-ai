import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SEARCH_MIGRATION = "supabase/migrations/20260721090000_search_comments_public_id.sql";
const MANUAL_SEED_SCRIPT = "scripts/seed-community-comments.cjs";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("AI comment search database contract", () => {
  it("joins visible comments to questions through public IDs", async () => {
    // Given: both database installation paths for the search RPC.
    const sqlSources = await Promise.all([
      source(SEARCH_MIGRATION),
      source("supabase/schema.sql"),
    ]);

    for (const sql of sqlSources) {
      // When: the current comment search definition is inspected.
      const start = sql.lastIndexOf("create or replace function public.search_comments");
      const end = sql.indexOf("$$;", start);
      const definition = sql.slice(start, end + 3).replaceAll("\r\n", "\n");

      // Then: public IDs drive the join and no internal question ID is returned.
      expect(definition).toContain("on qs.public_id = c.question_public_id");
      expect(definition).toContain("c.question_public_id as question_id");
      expect(definition).not.toContain("on qs.id = c.question_id");
    }
  });

  it("keeps the documented manual seed writer in the public-ID space", async () => {
    const script = await source(MANUAL_SEED_SCRIPT);
    const main = script.slice(script.indexOf("async function main()"));

    expect(script).toContain('.select("id, public_id")');
    expect(script).toContain('.select("question_public_id, body_text")');
    expect(script).toContain(
      "question_public_id: publicIdByInternal.get(comment.question_id)",
    );
    expect(main).not.toContain("\n      question_id: comment.question_id,");
  });
});
