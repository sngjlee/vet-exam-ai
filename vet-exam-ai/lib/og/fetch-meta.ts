// OG 카드용 메타 페치. 저작권 가드: questions에서 본문/정답/해설/회차/연도
// 컬럼은 절대 select하지 않는다 (코드 레벨 enforcement).

import { createClient } from "../supabase/server";

export type QuestionOgMeta = {
  publicId: string;
  category: string;
  commentsCount: number;
};

export type BoardKind = "announcement" | "suggestion";

export type BoardOgMeta = {
  title: string;
  kind: BoardKind;
  authorNickname: string | null;
  commentsCount: number;
  upvoteCount: number;
  visible: boolean;
};

/**
 * publicId(KVLE-NNNN) 또는 raw id로 단일 문제 메타를 조회한다.
 * 못 찾으면 null. 댓글 수는 comments 테이블 count 쿼리로 별도 페치.
 */
export async function fetchQuestionMeta(
  idOrPublicId: string,
): Promise<QuestionOgMeta | null> {
  const supabase = await createClient();

  // SELECT 화이트리스트: public_id, category, id (raw fallback 매칭용).
  // question/answer/explanation/round/year/session 은 절대 포함 금지.
  //
  // publicId 우선 → 실패 시 raw id로 한 번 더. PostgREST or() 필터에
  // template literal을 직접 삽입하면 escape 부담 + 한글 id에서 깨질 수 있어
  // sequential lookup이 안전.
  let row: { id: string; public_id: string | null; category: string | null } | null = null;
  {
    const { data } = await supabase
      .from("questions")
      .select("id, public_id, category")
      .eq("public_id", idOrPublicId)
      .maybeSingle();
    row = data ?? null;
  }
  if (!row) {
    const { data } = await supabase
      .from("questions")
      .select("id, public_id, category")
      .eq("id", idOrPublicId)
      .maybeSingle();
    row = data ?? null;
  }
  if (!row) return null;
  const q = row;

  // 댓글 수 — questions에 denormalized 컬럼 없음. comments.question_id로 count.
  const { count } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("question_id", q.id);

  return {
    publicId: q.public_id ?? q.id,
    category: q.category ?? "",
    commentsCount: count ?? 0,
  };
}

/**
 * 게시판 글 메타. visibility !== 'visible'이면 visible=false로 반환 →
 * 호출자가 OG 이미지 생성 스킵 + robots noindex 처리.
 */
export async function fetchBoardPostMeta(
  id: string,
  kind: BoardKind,
): Promise<BoardOgMeta | null> {
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("board_posts")
    .select("id, title, kind, visibility, user_id, is_anonymized, comment_count, upvote_count")
    .eq("id", id)
    .eq("kind", kind)
    .maybeSingle();

  if (!post) return null;

  // Narrow kind without an unchecked cast. If the enum gains a new value
  // (e.g. "study_info" on roadmap), this returns null instead of silently
  // letting an invalid kind through to consumers.
  if (post.kind !== "announcement" && post.kind !== "suggestion") {
    return null;
  }
  const narrowedKind: BoardKind = post.kind;

  const visible = post.visibility === "visible";

  // 익명 글 작성자 닉네임 절대 노출 금지.
  let authorNickname: string | null = null;
  if (visible && post.user_id && !post.is_anonymized) {
    const { data: prof } = await supabase
      .from("user_profiles_public")
      .select("nickname")
      .eq("user_id", post.user_id)
      .maybeSingle();
    authorNickname = prof?.nickname ?? null;
  }

  return {
    title: post.title,
    kind: narrowedKind,
    authorNickname,
    commentsCount: post.comment_count ?? 0,
    upvoteCount: post.upvote_count ?? 0,
    visible,
  };
}
