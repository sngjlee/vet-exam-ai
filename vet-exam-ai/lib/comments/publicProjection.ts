import type { CommentPreview } from "./list";
import type { CommentType } from "./schema";

export type PublicCommentRow = {
  readonly id: string;
  readonly question_public_id: string | null;
  readonly user_id: string | null;
  readonly type: CommentType;
  readonly body_text: string;
  readonly vote_score: number | null;
  readonly reply_count: number | null;
  readonly created_at: string;
};

export type PublicCommentQuestion = {
  readonly public_id: string | null;
  readonly question: string;
  readonly category: string;
  readonly topic: string | null;
};

type PublicCommentProjectionInput = {
  readonly row: PublicCommentRow;
  readonly question: PublicCommentQuestion | undefined;
  readonly authorNickname: string | null;
};

export function toPublicCommentPreview({
  row,
  question,
  authorNickname,
}: PublicCommentProjectionInput): CommentPreview {
  return {
    id: row.id,
    questionId: row.question_public_id ?? "",
    userId: row.user_id,
    type: row.type,
    bodyText: row.body_text,
    voteScore: row.vote_score ?? 0,
    replyCount: row.reply_count ?? 0,
    createdAt: row.created_at,
    questionPublicId: question?.public_id ?? null,
    questionPreview: question?.question ?? "문제 정보를 불러올 수 없습니다.",
    category: question?.category ?? "기타",
    topic: question?.topic ?? null,
    authorNickname,
  };
}