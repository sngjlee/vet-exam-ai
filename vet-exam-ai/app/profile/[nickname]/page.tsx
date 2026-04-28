import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { maskProfile } from "../../../lib/profile/maskPrivacy";
import type { BadgeType } from "../../../lib/profile/badgeMeta";
import ProfileBadges from "./ProfileBadges";
import ProfileCommentList from "./ProfileCommentList";
import ProfileEditController from "./ProfileEditController";

const PAGE_SIZE = 20;

function joinedLabel(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const months =
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth());
  if (months < 1) return "이번 달 가입";
  if (months < 12) return `가입 ${months}개월차`;
  const years = Math.floor(months / 12);
  return `가입 ${years}년차`;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname: rawNickname } = await params;
  const nickname = decodeURIComponent(rawNickname);
  const supabase = await createClient();

  // 1. Profile by nickname
  const { data: profile, error: pErr } = await supabase
    .from("user_profiles_public")
    .select("*")
    .eq("nickname", nickname)
    .maybeSingle();

  if (pErr) {
    throw new Error(`Profile fetch failed: ${pErr.message}`);
  }
  if (!profile) {
    notFound();
  }

  // 2. Owner check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === profile.user_id;

  // 3. Badges
  const { data: badgeRows } = await supabase
    .from("badges")
    .select("badge_type")
    .eq("user_id", profile.user_id);
  const ownedBadges: BadgeType[] = (badgeRows ?? []).map((b) => b.badge_type);

  // 4. Comments page 1 (peek-21)
  const { data: commentsRaw } = await supabase
    .from("comments")
    .select("id, question_id, body_text, vote_score, type, created_at")
    .eq("user_id", profile.user_id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE);

  const allComments = commentsRaw ?? [];
  const hasMore = allComments.length > PAGE_SIZE;
  const pageComments = hasMore ? allComments.slice(0, PAGE_SIZE) : allComments;

  // 5. Question stems
  const questionIds = Array.from(new Set(pageComments.map((c) => c.question_id)));
  const stemById = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, question")
      .in("id", questionIds);
    for (const q of qs ?? []) stemById.set(q.id, q.question);
  }

  const initialComments = pageComments.map((c) => ({
    id: c.id,
    question_id: c.question_id,
    question_stem_preview: (stemById.get(c.question_id) ?? "").slice(0, 80),
    body_text_preview: c.body_text.slice(0, 120),
    vote_score: c.vote_score,
    type: c.type,
    created_at: c.created_at,
  }));

  // 6. Total vote score (RPC)
  const { data: totalScoreRaw } = await supabase.rpc(
    "get_user_total_vote_score",
    { uid: profile.user_id },
  );
  const totalVoteScore = typeof totalScoreRaw === "number" ? totalScoreRaw : 0;

  // 7. Comment count (head, count exact)
  const { count: commentCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.user_id)
    .eq("status", "visible");

  const masked = maskProfile(profile, isOwner);
  const joined = joinedLabel(profile.created_at);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      {/* Header — owner sees edit controller, others see read-only */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 22,
        }}
      >
        {isOwner ? (
          <ProfileEditController profile={masked} joinedLabel={joined} />
        ) : (
          <ReadOnlyHeader profile={masked} joinedLabel={joined} />
        )}
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        <StatCard label="작성 댓글" value={commentCount ?? 0} />
        <StatCard label="받은 추천" value={totalVoteScore} />
        <StatCard
          label="가입일"
          value={new Date(profile.created_at).toLocaleDateString("ko-KR")}
        />
      </section>

      {/* Badges */}
      <ProfileBadges ownedBadges={ownedBadges} />

      {/* Comments */}
      <ProfileCommentList
        userId={profile.user_id}
        initialComments={initialComments}
        initialHasMore={hasMore}
      />
    </main>
  );
}

function ReadOnlyHeader({
  profile,
  joinedLabel,
}: {
  profile: ReturnType<typeof maskProfile>;
  joinedLabel: string;
}) {
  const meta = [
    profile.target_round ? `${profile.target_round}회 준비` : null,
    profile.university,
    joinedLabel,
  ].filter(Boolean);
  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text)",
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 800,
          margin: 0,
        }}
      >
        {profile.nickname}
      </h1>
      {profile.bio && (
        <p
          style={{
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {profile.bio}
        </p>
      )}
      {meta.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
          {meta.join(" · ")}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--teal)",
        borderRadius: 12,
        padding: "1.35rem",
      }}
    >
      <span
        className="kvle-label"
        style={{ color: "var(--teal)", fontSize: 12 }}
      >
        {label}
      </span>
      <p
        className="mt-2 font-bold kvle-mono"
        style={{ color: "var(--teal)", fontSize: 28, lineHeight: 1 }}
      >
        {value}
      </p>
    </div>
  );
}
