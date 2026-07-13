import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getMySignupStatus } from "../../../lib/auth/signup-status";
import SignupApplicationForm from "../pending-proof/_components/SignupApplicationForm";

export const dynamic = "force-dynamic";

export default async function RejectedPage() {
  const me = await getMySignupStatus();
  if (!me) redirect("/auth/login");
  if (me.status === "pending_proof")  redirect("/auth/pending-proof");
  if (me.status === "pending_review") redirect("/auth/pending-review");
  if (me.status === "approved")       redirect("/dashboard");

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("my_signup_application")
    .select("decision_reason, rejection_count")
    .maybeSingle();
  const { data: profile } = await supabase
    .rpc("get_my_profile")
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
          신청이 거부되었어요
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          아래 사유를 확인하시고 다시 제출해 주세요. 횟수 제한은 없습니다.
        </p>
        <SignupApplicationForm
          userId={me.userId}
          defaultUniversity={profile?.university ?? ""}
          defaultTargetRound={profile?.target_round ?? undefined}
          showRejectionBanner={
            app?.decision_reason
              ? { reason: app.decision_reason, count: app.rejection_count ?? 1 }
              : null
          }
        />
      </div>
    </main>
  );
}
