import { createClient } from "../../../lib/supabase/server";

export default async function AccountInfo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const joinedAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <section
      style={{
        padding: 20,
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 700,
          marginTop: 0,
          marginBottom: 16,
          color: "var(--text)",
        }}
      >
        계정 정보
      </h2>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          rowGap: 12,
          columnGap: 24,
          margin: 0,
          fontSize: 14,
        }}
      >
        <dt style={{ color: "var(--text-muted)" }}>이메일</dt>
        <dd style={{ margin: 0, color: "var(--text)" }}>{user.email ?? "—"}</dd>
        <dt style={{ color: "var(--text-muted)" }}>가입일</dt>
        <dd style={{ margin: 0, color: "var(--text)" }}>{joinedAt}</dd>
      </dl>
    </section>
  );
}
