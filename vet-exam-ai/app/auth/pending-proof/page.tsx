import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";
import SignupApplicationForm from "./_components/SignupApplicationForm";

export const dynamic = "force-dynamic";

export default async function PendingProofPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");

  if (me.status === "pending_review") redirect("/auth/pending-review");
  if (me.status === "rejected")       redirect("/auth/rejected");
  if (me.status === "approved")       redirect("/dashboard");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("user_profiles_public")
    .select("university, target_round")
    .eq("user_id", me.userId)
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "3rem 1.5rem 4rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          학생 인증을 완료해 주세요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          저작권 보호와 시딩 안전망을 위해 운영자가 수험생 자격을 직접 검수합니다.
          평일 1~2일 내 처리됩니다. 학생증/수험표 이미지 업로드를 권장하며,
          첨부가 어려우면 텍스트로 본인 정보를 적어 주세요.
        </p>
        <SignupApplicationForm
          userId={me.userId}
          defaultUniversity={profile?.university ?? ""}
          defaultTargetRound={profile?.target_round ?? undefined}
        />
      </div>
    </main>
  );
}
