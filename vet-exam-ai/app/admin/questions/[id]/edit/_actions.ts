"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../../lib/admin/guards";
import { createClient } from "../../../../../lib/supabase/server";
import { logAdminAction, diffJson } from "../../../../../lib/admin/audit";
import type { Database } from "../../../../../lib/supabase/types";

type QuestionUpdate = Database["public"]["Tables"]["questions"]["Update"];
type Difficulty = Database["public"]["Tables"]["questions"]["Row"]["difficulty"];

const ALLOWED_DIFFICULTIES: ReadonlyArray<NonNullable<Difficulty>> = [
  "easy",
  "medium",
  "hard",
];

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function updateQuestion(formData: FormData): Promise<void> {
  await requireAdmin();

  const idRaw = String(formData.get("id") ?? "");
  const id = decodeMaybe(idRaw);
  if (!id) redirect("/admin/questions?error=not_found");

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!before) {
    redirect(`/admin/questions/${encodeURIComponent(id)}?error=not_found`);
  }

  const choices = [1, 2, 3, 4, 5].map((i) =>
    String(formData.get(`choice_${i}`) ?? "").trim(),
  );
  const answer = String(formData.get("answer") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const difficultyRaw = String(formData.get("difficulty") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "");
  const communityNotes = String(formData.get("community_notes") ?? "");
  const tagsRaw = String(formData.get("tags") ?? "");
  const isActive = formData.get("is_active") === "on";

  const errs: string[] = [];
  if (choices.some((c) => c.length === 0)) errs.push("choices_empty");
  if (!choices.includes(answer)) errs.push("answer_mismatch");
  if (!question) errs.push("question_empty");
  if (!category) errs.push("category_empty");

  if (errs.length > 0) {
    redirect(
      `/admin/questions/${encodeURIComponent(id)}/edit?error=${errs[0]}`,
    );
  }

  const difficulty: Difficulty =
    difficultyRaw && ALLOWED_DIFFICULTIES.includes(difficultyRaw as NonNullable<Difficulty>)
      ? (difficultyRaw as Difficulty)
      : null;

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const update: QuestionUpdate = {
    question,
    choices,
    answer,
    category,
    subject: subject || null,
    topic: topic || null,
    difficulty,
    explanation,
    community_notes: communityNotes || null,
    tags,
    is_active: isActive,
  };

  const { error } = await supabase.from("questions").update(update).eq("id", id);
  if (error) {
    console.error("[admin] update question failed", error);
    redirect(
      `/admin/questions/${encodeURIComponent(id)}/edit?error=db_error`,
    );
  }

  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = { ...beforeRecord, ...(update as Record<string, unknown>) };
  const { before: bDiff, after: aDiff } = diffJson(beforeRecord, afterRecord);

  if (Object.keys(aDiff).length > 0) {
    await logAdminAction({
      action: "question_update",
      targetType: "question",
      targetId: id,
      before: bDiff,
      after: aDiff,
    });
  }

  revalidatePath(`/admin/questions/${encodeURIComponent(id)}`);
  redirect(`/admin/questions/${encodeURIComponent(id)}`);
}
