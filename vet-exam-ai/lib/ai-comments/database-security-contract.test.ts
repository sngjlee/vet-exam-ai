import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260713050000_ai_comment_candidates.sql";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function functionDefinition(sql: string, name: string): string {
  const start = sql.indexOf("create or replace function public." + name);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("AI comment database security contract", () => {
  it("uses complete PostgreSQL dollar quotes around the HTML renderer", async () => {
    // Given: both install paths for the HTML renderer.
    const sqlSources = await Promise.all([source(MIGRATION), source("supabase/schema.sql")]);

    for (const sql of sqlSources) {
      // When: the renderer block is isolated without trusting its delimiter.
      const start = sql.indexOf(
        "create or replace function public.render_ai_comment_body_html",
      );
      const end = sql.indexOf(
        "revoke execute on function public.render_ai_comment_body_html",
        start,
      );
      const renderer = sql.slice(start, end).replaceAll("\r\n", "\n");

      // Then: PostgreSQL sees a complete opening and closing dollar quote.
      expect(renderer).toContain("\nas $$\n");
      expect(renderer.trimEnd()).toMatch(/\$\$;$/);
    }
  });
  it("derives approval HTML inside the database without a caller HTML argument", async () => {
    // Given: the candidate review migration.
    const sql = await source(MIGRATION);

    // When: the review RPC definition is inspected.
    const review = functionDefinition(sql, "review_ai_comment_candidate");

    // Then: the boundary accepts only id/resolution/note and renders immutable body_text.
    expect(review).not.toContain("p_body_html");
    expect(review).toContain("public.render_ai_comment_body_html(v_candidate.body_text)");
    expect(sql).toContain("pg_catalog.replace");
    expect(sql).toContain("&#39;");
  });

  it("expires abandoned generation leases before measuring pending capacity", async () => {
    // Given: the serialized reservation RPC.
    const sql = await source(MIGRATION);
    const reserve = functionDefinition(sql, "reserve_ai_comment_generation");

    // When: lease recovery and pending counting positions are compared.
    const staleRecovery = reserve.indexOf("stale_generation_claim");
    const pendingCount = reserve.indexOf("select count(*) into v_pending_candidates");

    // Then: stale claims are failed first and retain a completion timestamp.
    expect(staleRecovery).toBeGreaterThanOrEqual(0);
    expect(staleRecovery).toBeLessThan(pendingCount);
    expect(reserve).toContain("interval '15 minutes'");
    expect(reserve).toContain("completed_at = pg_catalog.now()");
  });

  it("pins definer functions to pg_catalog and denies client schema creation", async () => {
    // Given: all AI candidate database objects.
    const sql = await source(MIGRATION);

    // When: the privileged function definitions are inspected.
    const reserve = functionDefinition(sql, "reserve_ai_comment_generation");
    const review = functionDefinition(sql, "review_ai_comment_candidate");

    // Then: neither function resolves through writable public objects.
    expect(reserve).toContain("set search_path = pg_catalog");
    expect(review).toContain("set search_path = pg_catalog");
    expect(sql).toContain("revoke create on schema public from public, anon, authenticated");
  });

  it("keeps fresh bootstrap public-id assignment aligned with migrations", async () => {
    // Given: the consolidated bootstrap schema.
    const sql = await source("supabase/schema.sql");

    // When: question public-id assignment objects are inspected.
    // Then: both hardened function and trigger are installed.
    expect(sql).toContain("create or replace function public.assign_question_public_id()");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("create trigger trg_questions_assign_public_id");
  });
});