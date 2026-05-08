import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";

export const dynamic = "force-dynamic";

export default async function PendingReviewPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");
  if (me.status === "pending_proof") redirect("/auth/pending-proof");
  if (me.status === "rejected")      redirect("/auth/rejected");
  if (me.status === "approved")      redirect("/dashboard");

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("my_signup_application")
    .select("submitted_at")
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          운영자 검토 중
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
          신청서가 접수되었어요. 평일 1~2일 내로 검토 결과를 알려 드립니다.
          {app?.submitted_at ? (
            <>
              <br />
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                제출: {new Date(app.submitted_at).toLocaleString("ko-KR")}
              </span>
            </>
          ) : null}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: "1.5rem" }}>
          그동안 문제와 댓글은 자유롭게 둘러보실 수 있어요.
        </p>
      </div>
    </main>
  );
}
