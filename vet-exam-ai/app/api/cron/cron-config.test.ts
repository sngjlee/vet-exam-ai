import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("AI comment candidate cron configuration", () => {
  it("schedules the dedicated candidate route exactly once", async () => {
    // Given: the production Vercel cron configuration.
    const configText = await readFile(resolve(process.cwd(), "vercel.json"), "utf8");
    const config = z.object({
      crons: z.array(z.object({ path: z.string(), schedule: z.string() }).strict()),
    }).strict().parse(JSON.parse(configText));

    // When: candidate-generation jobs are selected.
    const candidateJobs = config.crons.filter(
      (job) => job.path === "/api/cron/ai-comment-candidates",
    );

    // Then: one daily 05:00 UTC job is registered.
    expect(candidateJobs).toEqual([
      { path: "/api/cron/ai-comment-candidates", schedule: "0 5 * * *" },
    ]);
  });

  it("keeps signup proof purge independent from comment seeding", async () => {
    // Given: the signup-proof purge route source.
    const routeText = await readFile(
      resolve(process.cwd(), "app/api/cron/signup-proof-purge/route.ts"),
      "utf8",
    );

    // When: scheduled purge behavior is inspected.
    const directSeedingReferences = routeText.match(/runDailyCommentSeeding|commentSeeding/g) ?? [];

    // Then: the purge route has no comment-seeding dependency or result field.
    expect(directSeedingReferences).toEqual([]);
  });
});
