import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureSeedAccounts } from "../cron/comment-seeding";
import type { Database } from "../supabase/types";
import type { AiCommentSeedAccountIds } from "./generate";

export async function resolveAiCommentSeedAccountIds(
  admin: SupabaseClient<Database>,
): Promise<AiCommentSeedAccountIds> {
  const ids = await ensureSeedAccounts(admin);
  return {
    memory: ids.memory,
    explain: ids.explain,
    wrong: ids.wrong,
    correction: ids.correction,
  };
}
